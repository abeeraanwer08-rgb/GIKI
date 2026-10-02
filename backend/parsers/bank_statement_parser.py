"""
Bank statement parser.

Uses the same OpenAI Vision integration as the other parsers. Extraction is
LLM work; everything that decides whether the result can be trusted — totals,
running-balance checks, privacy masking — is deterministic code in this module.
Missing or unreadable fields are represented as ``None``.
"""

import base64
import json
import logging
import os
import re
from datetime import date
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI, OpenAIError

from schemas.bank_statement import BankStatementAnalysisResponse, BankTransaction
from schemas.receipt import ReceiptAnalysisResponse, ReceiptItem, ReceiptValidationReport
from services.categorization import CategorizationService

logger = logging.getLogger(__name__)

_categorizer = CategorizationService()

BANK_STATEMENT_PARSER_VERSION = "bank-statement-parser-v1"
BANK_STATEMENT_PROMPT_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "bank_statement_prompt.txt"
)

# Printed amounts are rounded to paisa, so allow that much slack when checking sums.
TOLERANCE = 0.01
# A statement page legitimately holds a few dozen rows; this only stops a runaway
# model response from creating thousands of records.
MAX_TRANSACTIONS = 300


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = re.sub(r"[,\s]|(?i:pkr|rs\.?)", "", value)
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def _movement(value: Any) -> float | None:
    """A printed debit/credit amount. Zero means "no movement", so it becomes None."""
    number = _number(value)
    return None if number == 0 else number


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _iso_date(value: Any) -> str | None:
    """Accept only a real YYYY-MM-DD date; anything else is treated as unreadable."""
    text = _text(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return None


def mask_account_number(value: Any) -> str | None:
    """Keep only the last four digits so a full account number is never stored."""
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[-4:] if len(digits) >= 4 else None


class BankStatementParser:
    """Extract structured bank statement data from an image."""

    parser_version = BANK_STATEMENT_PARSER_VERSION

    def __init__(self):
        api_key = os.environ.get("OPENAI_API_KEY")
        self._client = AsyncOpenAI(api_key=api_key) if api_key else None
        self._system_prompt = BANK_STATEMENT_PROMPT_PATH.read_text(encoding="utf-8")

    async def process_bytes(
        self,
        image_bytes: bytes,
        filename: str,
        content_type: str,
    ) -> BankStatementAnalysisResponse:
        base_meta = {
            "filename": filename,
            "content_type": content_type,
            "size_bytes": len(image_bytes),
        }

        def failure(message: str) -> BankStatementAnalysisResponse:
            return BankStatementAnalysisResponse(**base_meta, status="error", message=message)

        if not self._client:
            logger.error("OPENAI_API_KEY is not set — cannot analyze bank statement.")
            return failure("OPENAI_API_KEY is not configured on the server.")

        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{content_type};base64,{b64_image}"

        try:
            response = await self._client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[
                    {"role": "system", "content": self._system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
                            {"type": "text", "text": "Extract the bank statement as JSON."},
                        ],
                    },
                ],
                max_tokens=4000,
                timeout=60,
                response_format={"type": "json_object"},
            )
        except OpenAIError as exc:
            logger.error("OpenAI bank statement API error: %s", exc)
            return failure(f"OpenAI API error: {exc}")
        except Exception:
            logger.exception("Unexpected bank statement analysis error.")
            return failure("Unexpected error during bank statement analysis.")

        raw_text = response.choices[0].message.content or ""
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError:
            logger.error("OpenAI returned non-JSON for bank statement: %s", raw_text)
            return failure("AI returned an invalid response. Please try again.")

        return self._build_response(base_meta, data)

    # ── Deterministic checks ──────────────────────────────────────────────────

    @staticmethod
    def total_debits(analysis: BankStatementAnalysisResponse) -> float:
        return round(sum(t.debit or 0.0 for t in analysis.transactions), 2)

    @staticmethod
    def total_credits(analysis: BankStatementAnalysisResponse) -> float:
        return round(sum(t.credit or 0.0 for t in analysis.transactions), 2)

    def validate(self, analysis: BankStatementAnalysisResponse) -> ReceiptValidationReport:
        """
        Check the extraction against itself.

        Hard errors are impossible values. Everything else is a warning the user
        sees on the review screen: unmatched printed totals, a broken running
        balance, rows with no usable amount, or missing header fields.
        """
        warnings: list[str] = []
        errors: list[str] = []
        txns = analysis.transactions

        if not txns:
            warnings.append("No transactions were found on this page.")

        for index, txn in enumerate(txns, start=1):
            if (txn.debit is not None and txn.debit < 0) or (txn.credit is not None and txn.credit < 0):
                errors.append(f"Transaction {index} has a negative amount.")
            if txn.debit is None and txn.credit is None:
                warnings.append(f"Transaction {index} ({txn.description or 'no description'}) has no readable amount.")
            if txn.debit is not None and txn.credit is not None:
                warnings.append(f"Transaction {index} lists both a debit and a credit; check it.")

        for name in ("bank_name", "currency", "period_start", "period_end"):
            if getattr(analysis, name) is None:
                warnings.append(f"Statement field is missing: {name}.")

        calculated_debits = self.total_debits(analysis)
        calculated_credits = self.total_credits(analysis)

        difference: float | None = None
        if analysis.stated_total_debits is not None:
            difference = round(calculated_debits - analysis.stated_total_debits, 2)
            if abs(difference) > TOLERANCE:
                warnings.append(
                    f"Transactions add up to {calculated_debits:,.2f} in debits but the "
                    f"statement prints {analysis.stated_total_debits:,.2f}. A row may be "
                    "missing or misread."
                )
        if analysis.stated_total_credits is not None and (
            abs(calculated_credits - analysis.stated_total_credits) > TOLERANCE
        ):
            warnings.append(
                f"Transactions add up to {calculated_credits:,.2f} in credits but the "
                f"statement prints {analysis.stated_total_credits:,.2f}."
            )

        if analysis.opening_balance is not None and analysis.closing_balance is not None:
            expected_close = round(analysis.opening_balance + calculated_credits - calculated_debits, 2)
            if abs(expected_close - analysis.closing_balance) > TOLERANCE:
                warnings.append(
                    f"Opening balance + credits − debits gives {expected_close:,.2f} but the "
                    f"closing balance is {analysis.closing_balance:,.2f}."
                )

        previous = analysis.opening_balance
        for index, txn in enumerate(txns, start=1):
            if previous is not None and txn.balance is not None:
                expected = round(previous + (txn.credit or 0.0) - (txn.debit or 0.0), 2)
                if abs(expected - txn.balance) > TOLERANCE:
                    warnings.append(
                        f"Running balance breaks at transaction {index}: expected "
                        f"{expected:,.2f}, statement shows {txn.balance:,.2f}."
                    )
                    break  # one broken link is enough; later rows would all repeat it
            if txn.balance is not None:
                previous = txn.balance

        if analysis.period_start and analysis.period_end and analysis.period_start > analysis.period_end:
            warnings.append("The statement period starts after it ends.")

        return ReceiptValidationReport(
            valid=not errors,
            warnings=warnings,
            errors=errors,
            calculated_total=calculated_debits,
            difference=difference,
        )

    def to_legacy_receipt_response(
        self, analysis: BankStatementAnalysisResponse
    ) -> ReceiptAnalysisResponse:
        """Project the statement into the unchanged public upload response shape."""
        debits = [t for t in analysis.transactions if t.debit]
        items = [
            ReceiptItem(
                item_name=t.description or "Bank transaction",
                quantity=1,
                unit_price=t.debit,
                total_price=t.debit,
                category=_categorizer.categorize(
                    document_type=None, merchant=t.description
                ).category,
            )
            for t in debits
        ] or None
        return ReceiptAnalysisResponse(
            status=analysis.status,
            filename=analysis.filename,
            content_type=analysis.content_type,
            size_bytes=analysis.size_bytes,
            message=analysis.message,
            merchant_name=analysis.bank_name,
            purchase_date=analysis.period_end,
            currency=analysis.currency,
            total_amount=self.total_debits(analysis) if debits else None,
            items=items,
        )

    # ── Response coercion ─────────────────────────────────────────────────────

    def _build_response(self, base_meta: dict[str, Any], data: Any) -> BankStatementAnalysisResponse:
        if not isinstance(data, dict):
            data = {}

        transactions: list[BankTransaction] = []
        for raw in (data.get("transactions") or [])[:MAX_TRANSACTIONS]:
            if not isinstance(raw, dict):
                continue
            transactions.append(
                BankTransaction(
                    date=_iso_date(raw.get("date")),
                    description=_text(raw.get("description")) or "",
                    debit=_movement(raw.get("debit")),
                    credit=_movement(raw.get("credit")),
                    balance=_number(raw.get("balance")),
                    reference=_text(raw.get("reference")),
                )
            )

        return BankStatementAnalysisResponse(
            **base_meta,
            status="analysed",
            message="Bank statement analysed successfully.",
            bank_name=_text(data.get("bank_name")),
            account_last4=mask_account_number(data.get("account_number")),
            currency=_text(data.get("currency")),
            period_start=_iso_date(data.get("period_start")),
            period_end=_iso_date(data.get("period_end")),
            opening_balance=_number(data.get("opening_balance")),
            closing_balance=_number(data.get("closing_balance")),
            stated_total_debits=_number(data.get("total_debits")),
            stated_total_credits=_number(data.get("total_credits")),
            transactions=transactions,
        )
