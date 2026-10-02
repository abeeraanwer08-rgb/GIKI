"""
Invoice parser.

Same split as the other parsers: the vision model copies what is printed, and
deterministic code decides whether the numbers can be trusted (line maths,
subtotal, tax/discount/shipping reconciliation, dates).
"""

import base64
import json
import logging
import os
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI, OpenAIError

from parsers.bank_statement_parser import _movement, _number, _text
from schemas.invoice import InvoiceAnalysisResponse, InvoiceLine
from schemas.receipt import ReceiptAnalysisResponse, ReceiptItem, ReceiptValidationReport
from services.categorization import CategorizationService
from services.statement_dates import parse_statement_date

logger = logging.getLogger(__name__)

INVOICE_PARSER_VERSION = "invoice-parser-v1"
INVOICE_PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "invoice_prompt.txt"
TOLERANCE = 0.01
MAX_LINES = 300

_categorizer = CategorizationService()


class InvoiceParser:
    """Extract structured invoice data from an image."""

    parser_version = INVOICE_PARSER_VERSION

    def __init__(self):
        api_key = os.environ.get("OPENAI_API_KEY")
        self._client = AsyncOpenAI(api_key=api_key) if api_key else None
        self._system_prompt = INVOICE_PROMPT_PATH.read_text(encoding="utf-8")

    async def process_bytes(self, image_bytes: bytes, filename: str, content_type: str) -> InvoiceAnalysisResponse:
        base_meta = {"filename": filename, "content_type": content_type, "size_bytes": len(image_bytes)}

        def failure(message: str) -> InvoiceAnalysisResponse:
            return InvoiceAnalysisResponse(**base_meta, status="error", message=message)

        if not self._client:
            logger.error("OPENAI_API_KEY is not set — cannot analyze invoice.")
            return failure("OPENAI_API_KEY is not configured on the server.")

        data_url = f"data:{content_type};base64,{base64.b64encode(image_bytes).decode('utf-8')}"
        try:
            response = await self._client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[
                    {"role": "system", "content": self._system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
                            {"type": "text", "text": "Extract the invoice as JSON."},
                        ],
                    },
                ],
                max_tokens=3000,
                timeout=60,
                response_format={"type": "json_object"},
            )
        except OpenAIError as exc:
            logger.error("OpenAI invoice API error: %s", exc)
            return failure(f"OpenAI API error: {exc}")
        except Exception:
            logger.exception("Unexpected invoice analysis error.")
            return failure("Unexpected error during invoice analysis.")

        raw_text = response.choices[0].message.content or ""
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError:
            logger.error("OpenAI returned non-JSON for invoice: %s", raw_text)
            return failure("AI returned an invalid response. Please try again.")
        return self._build_response(base_meta, data)

    # ── Multi-page ────────────────────────────────────────────────────────────

    @staticmethod
    def merge_pages(pages: list[InvoiceAnalysisResponse]) -> InvoiceAnalysisResponse:
        """Combine per-page results: lines are concatenated; header from the first
        page that has each field; totals from the last page that prints them."""
        if len(pages) == 1:
            return pages[0]
        failed = next((p for p in pages if p.status != "analysed"), None)
        if failed:
            return failed

        def first(name: str):
            return next((getattr(p, name) for p in pages if getattr(p, name) is not None), None)

        def last(name: str):
            return next((getattr(p, name) for p in reversed(pages) if getattr(p, name) is not None), None)

        base = pages[0]
        return InvoiceAnalysisResponse(
            status="analysed",
            filename=base.filename,
            content_type=base.content_type,
            size_bytes=sum(p.size_bytes for p in pages),
            message=f"Invoice analysed successfully ({len(pages)} pages).",
            vendor_name=first("vendor_name"),
            vendor_tax_id=first("vendor_tax_id"),
            invoice_number=first("invoice_number"),
            invoice_date=first("invoice_date"),
            due_date=last("due_date"),
            payment_terms=first("payment_terms"),
            currency=first("currency"),
            lines=[line for p in pages for line in p.lines],
            subtotal_amount=last("subtotal_amount"),
            tax_amount=last("tax_amount"),
            discount_amount=last("discount_amount"),
            shipping_amount=last("shipping_amount"),
            total_amount=last("total_amount"),
        )

    # ── Deterministic checks ──────────────────────────────────────────────────

    @staticmethod
    def lines_total(analysis: InvoiceAnalysisResponse) -> float | None:
        amounts = [line.amount for line in analysis.lines]
        if not amounts or any(a is None for a in amounts):
            return None
        return round(sum(a for a in amounts if a is not None), 2)

    def expected_total(self, analysis: InvoiceAnalysisResponse) -> float | None:
        base = analysis.subtotal_amount if analysis.subtotal_amount is not None else self.lines_total(analysis)
        if base is None:
            return None
        return round(
            base + (analysis.tax_amount or 0.0) + (analysis.shipping_amount or 0.0) - (analysis.discount_amount or 0.0), 2
        )

    def validate(self, analysis: InvoiceAnalysisResponse) -> ReceiptValidationReport:
        warnings: list[str] = []
        errors: list[str] = []

        for name, label in (
            ("vendor_name", "vendor"), ("invoice_number", "invoice number"), ("invoice_date", "invoice date"),
            ("currency", "currency"), ("total_amount", "total"),
        ):
            if getattr(analysis, name) is None:
                warnings.append(f"Invoice field is missing: {label}.")
        if not analysis.lines:
            warnings.append("No line items were found on this invoice.")

        for label, value in (
            ("tax", analysis.tax_amount), ("discount", analysis.discount_amount),
            ("shipping", analysis.shipping_amount), ("total", analysis.total_amount),
            ("subtotal", analysis.subtotal_amount),
        ):
            if value is not None and value < 0:
                errors.append(f"Invoice {label} cannot be negative.")

        for index, line in enumerate(analysis.lines, start=1):
            if line.amount is not None and line.amount < 0:
                errors.append(f"Line {index} has a negative amount.")
            if line.amount is None:
                warnings.append(f"Line {index} ({line.description or 'no description'}) has no readable amount.")
            elif line.quantity is not None and line.unit_price is not None:
                expected = round(line.quantity * line.unit_price, 2)
                if abs(expected - line.amount) > max(TOLERANCE, 0.005 * abs(line.amount)):
                    warnings.append(
                        f"Line {index}: {line.quantity:g} × {line.unit_price:,.2f} is {expected:,.2f}, "
                        f"but the amount is {line.amount:,.2f}."
                    )

        lines_total = self.lines_total(analysis)
        subtotal_difference: float | None = None
        if analysis.subtotal_amount is not None and lines_total is not None:
            subtotal_difference = round(lines_total - analysis.subtotal_amount, 2)
            if abs(subtotal_difference) > TOLERANCE:
                warnings.append(
                    f"Line items add up to {lines_total:,.2f} but the subtotal is {analysis.subtotal_amount:,.2f}. "
                    "A line may be missing or misread."
                )

        expected = self.expected_total(analysis)
        difference: float | None = None
        if expected is not None and analysis.total_amount is not None:
            difference = round(expected - analysis.total_amount, 2)
            if abs(difference) > TOLERANCE:
                warnings.append(
                    f"Subtotal + tax + shipping − discount is {expected:,.2f} but the total is "
                    f"{analysis.total_amount:,.2f}."
                )

        if analysis.invoice_date and analysis.due_date and analysis.due_date < analysis.invoice_date:
            warnings.append("The due date is before the invoice date.")

        return ReceiptValidationReport(
            valid=not errors,
            warnings=warnings,
            errors=errors,
            calculated_total=lines_total,
            subtotal_difference=subtotal_difference,
            difference=difference,
        )

    def to_legacy_receipt_response(self, analysis: InvoiceAnalysisResponse) -> ReceiptAnalysisResponse:
        items = [
            ReceiptItem(
                item_name=line.description or "Invoice line",
                quantity=line.quantity if line.quantity is not None else 1,
                unit_price=line.unit_price if line.unit_price is not None else line.amount,
                total_price=line.amount,
                category=_categorizer.categorize(
                    document_type=None, merchant=analysis.vendor_name, item_descriptions=[line.description]
                ).category,
            )
            for line in analysis.lines
            if line.amount is not None
        ] or None
        return ReceiptAnalysisResponse(
            status=analysis.status,
            filename=analysis.filename,
            content_type=analysis.content_type,
            size_bytes=analysis.size_bytes,
            message=analysis.message,
            merchant_name=analysis.vendor_name,
            purchase_date=analysis.invoice_date,
            currency=analysis.currency,
            subtotal_amount=analysis.subtotal_amount,
            tax_amount=analysis.tax_amount,
            delivery_charge=analysis.shipping_amount,
            discount_amount=analysis.discount_amount,
            total_amount=analysis.total_amount,
            items=items,
        )

    # ── Response coercion ─────────────────────────────────────────────────────

    def _build_response(self, base_meta: dict[str, Any], data: Any) -> InvoiceAnalysisResponse:
        if not isinstance(data, dict):
            data = {}

        lines: list[InvoiceLine] = []
        for raw in (data.get("lines") or [])[:MAX_LINES]:
            if not isinstance(raw, dict):
                continue
            description = _text(raw.get("description")) or ""
            quantity, unit_price, amount = _number(raw.get("quantity")), _number(raw.get("unit_price")), _number(raw.get("amount"))
            if not description and quantity is None and unit_price is None and amount is None:
                continue
            lines.append(InvoiceLine(description=description, quantity=quantity, unit_price=unit_price, amount=amount))

        return InvoiceAnalysisResponse(
            **base_meta,
            status="analysed",
            message="Invoice analysed successfully.",
            vendor_name=_text(data.get("vendor_name")),
            vendor_tax_id=_text(data.get("vendor_tax_id")),
            invoice_number=_text(data.get("invoice_number")),
            invoice_date=parse_statement_date(data.get("invoice_date")),
            due_date=parse_statement_date(data.get("due_date")),
            payment_terms=_text(data.get("payment_terms")),
            currency=_text(data.get("currency")),
            lines=lines,
            subtotal_amount=_number(data.get("subtotal")),
            tax_amount=_number(data.get("tax")),
            discount_amount=_movement(data.get("discount")),
            shipping_amount=_movement(data.get("shipping")),
            total_amount=_number(data.get("total")),
        )
