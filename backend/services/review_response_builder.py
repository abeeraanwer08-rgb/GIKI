"""
Build the frontend-friendly response used by the Android Review Screen.

This service only reshapes already-generated backend data. It does not invoke
parsers, validators, or an LLM, and it does not persist anything.
"""

from typing import Any, Mapping, Sequence

from schemas.receipt import (
    ImageQualityReport,
    ReceiptAnalysisResponse,
    ReceiptValidationReport,
    ReceiptUploadResponse,
)
from schemas.review_response import EditableField, ReviewResponse, ReviewResponseItem
from schemas.ufr import ReviewHint, UniversalFinancialRecord
from services.confidence import ConfidenceResult


class ReviewResponseBuilder:
    """Convert pipeline outputs into one Android-facing review response."""

    def build(
        self,
        *,
        record: UniversalFinancialRecord,
        validation_results: ReceiptValidationReport | None,
        confidence_results: ConfidenceResult | None,
        review_hints: Sequence[ReviewHint] | None,
        original_image_reference: str | None = None,
        processing_metadata: Mapping[str, Any] | None = None,
        quality_report: ImageQualityReport | None = None,
        legacy_response: ReceiptUploadResponse | None = None,
    ) -> ReviewResponse:
        """Build one response from existing UFR and pipeline results."""
        confidence = (
            confidence_results.confidence
            if confidence_results is not None
            else record.metadata.confidence
        )
        hints = list(review_hints or record.metadata.review_hints)

        metadata = {
            "source": record.metadata.source,
            "parser_version": record.metadata.parser_version,
            "quality_score": record.metadata.quality_score,
            "confidence_level": (
                confidence_results.confidence_level
                if confidence_results is not None
                else record.metadata.confidence_level
            ),
            "review_required": (
                confidence_results.review_required
                if confidence_results is not None
                else record.metadata.review_required
            ),
            "subtotal_amount": record.metadata.subtotal_amount,
            "tax_amount": record.metadata.tax_amount,
            "service_charge": record.metadata.service_charge,
            "delivery_charge": record.metadata.delivery_charge,
            "discount_amount": record.metadata.discount_amount,
            "grand_total_amount": record.metadata.grand_total_amount,
        }
        if record.metadata.details:
            metadata["details"] = record.metadata.details
        metadata.update(processing_metadata or {})

        return ReviewResponse(
            document_type=record.document_type,
            original_image_reference=original_image_reference,
            editable_fields=self._editable_fields(record, confidence),
            extracted_items=[
                ReviewResponseItem.model_validate(item.model_dump())
                for item in record.items
            ],
            validation_warnings=(
                validation_results.warnings if validation_results is not None else []
            ),
            review_hints=hints,
            overall_confidence=confidence,
            processing_metadata=metadata,
            status=legacy_response.status if legacy_response else "analysed",
            quality=legacy_response.quality if legacy_response else quality_report,
            validation=(
                legacy_response.validation
                if legacy_response
                else validation_results
            ),
            receipt=legacy_response.receipt if legacy_response else None,
        )

    def _editable_fields(
        self,
        record: UniversalFinancialRecord,
        confidence: float | None,
    ) -> dict[str, EditableField]:
        """Expose generic and document-specific values for inline editing."""
        fields: dict[str, EditableField] = {
            "merchant": self._field(record.merchant, confidence),
            "purchase_date": self._field(record.document_date, confidence),
            "currency": self._field(record.currency, confidence),
            "total_amount": self._field(record.total_amount, confidence),
        }

        if record.document_type == "utility_bill":
            for name in ("consumer_number", "billing_period", "due_date"):
                fields[name] = self._field(
                    self._first_item_metadata(record, name), confidence
                )
        elif record.document_type == "invoice":
            for name in ("invoice_number", "due_date"):
                fields[name] = self._field(record.metadata.details.get(name), confidence)
        elif record.document_type == "bank_statement":
            for name in ("period_start", "period_end", "account_last4"):
                fields[name] = self._field(record.metadata.details.get(name), confidence)
        elif record.document_type == "wallet_screenshot":
            for name in (
                "transaction_type",
                "counterparty",
                "transaction_date",
                "transaction_time",
                "transaction_reference",
            ):
                fields[name] = self._field(
                    self._first_item_metadata(record, name), confidence
                )

        return fields

    @staticmethod
    def _field(value: Any, confidence: float | None) -> EditableField:
        return EditableField(value=value, editable=True, confidence=confidence)

    @staticmethod
    def _first_item_metadata(
        record: UniversalFinancialRecord, field_name: str
    ) -> Any:
        for item in record.items:
            if field_name in item.metadata:
                return item.metadata[field_name]
        return None