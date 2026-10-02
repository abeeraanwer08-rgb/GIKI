"""
Deterministic field-level review hints for Universal Financial Records.

This service does not call the LLM. It inspects the generated UFR and the
existing quality/validation reports so downstream consumers can explain why a
record needs human review.
"""

from typing import Any

from schemas.receipt import ImageQualityReport, ReceiptValidationReport
from schemas.ufr import ReviewHint, UniversalFinancialRecord


class ReviewHintService:
    """Generate actionable field-level hints from deterministic backend rules."""

    LOW_QUALITY_THRESHOLD = 70
    TOTAL_MISMATCH_WARNING_PREFIX = "Calculated total ("

    def generate(
        self,
        *,
        record: UniversalFinancialRecord,
        quality_report: ImageQualityReport | None = None,
        validation_report: ReceiptValidationReport | None = None,
    ) -> list[ReviewHint]:
        """Return review hints in stable field order."""
        hints: list[ReviewHint] = []

        self._add_missing_receipt_fields(hints, record)
        self._add_total_mismatch_hint(hints, validation_report)
        self._add_quality_hint(hints, quality_report, record)

        if record.document_type == "utility_bill":
            self._add_missing_utility_fields(hints, record)
        elif record.document_type == "wallet_screenshot":
            self._add_missing_wallet_fields(hints, record)
        elif record.document_type == "invoice":
            if not self._present(record.metadata.details.get("invoice_number")):
                hints.append(
                    ReviewHint(
                        field="invoice_number",
                        message="Invoice number could not be identified.",
                    )
                )

        return hints

    def _add_missing_receipt_fields(
        self, hints: list[ReviewHint], record: UniversalFinancialRecord
    ) -> None:
        if not self._present(record.merchant):
            hints.append(
                ReviewHint(
                    field="merchant_name",
                    message="Merchant name could not be identified.",
                )
            )
        if not self._present(record.document_date):
            hints.append(
                ReviewHint(
                    field="purchase_date",
                    message="Purchase date could not be identified.",
                )
            )
        if record.total_amount is None:
            hints.append(
                ReviewHint(
                    field="total_amount",
                    message="Total amount could not be identified.",
                )
            )

    def _add_total_mismatch_hint(
        self,
        hints: list[ReviewHint],
        validation_report: ReceiptValidationReport | None,
    ) -> None:
        if validation_report is None:
            return

        has_mismatch_warning = any(
            warning.startswith(self.TOTAL_MISMATCH_WARNING_PREFIX)
            for warning in validation_report.warnings
        )
        has_nonzero_difference = (
            validation_report.difference is not None
            and abs(validation_report.difference) > 0
        )
        if has_mismatch_warning or has_nonzero_difference:
            hints.append(
                ReviewHint(
                    field="total_amount",
                    message="Extracted total does not match the calculated item total.",
                )
            )

    def _add_quality_hint(
        self,
        hints: list[ReviewHint],
        quality_report: ImageQualityReport | None,
        record: UniversalFinancialRecord,
    ) -> None:
        quality_score = (
            quality_report.quality_score
            if quality_report is not None
            else record.metadata.quality_score
        )
        quality_failed = quality_report is not None and not quality_report.passed
        if quality_failed or (
            quality_score is not None and quality_score < self.LOW_QUALITY_THRESHOLD
        ):
            hints.append(
                ReviewHint(
                    field="image_quality",
                    message="Image quality may reduce extraction reliability.",
                )
            )

    def _add_missing_utility_fields(
        self, hints: list[ReviewHint], record: UniversalFinancialRecord
    ) -> None:
        self._add_metadata_hint(
            hints,
            record,
            "consumer_number",
            "Consumer number could not be identified.",
        )
        self._add_metadata_hint(
            hints,
            record,
            "billing_period",
            "Billing period could not be identified.",
        )
        self._add_metadata_hint(
            hints,
            record,
            "due_date",
            "Due date could not be identified.",
        )

    def _add_missing_wallet_fields(
        self, hints: list[ReviewHint], record: UniversalFinancialRecord
    ) -> None:
        self._add_metadata_hint(
            hints,
            record,
            "transaction_reference",
            "Wallet transaction reference number could not be identified.",
            output_field="reference_number",
        )
        self._add_metadata_hint(
            hints,
            record,
            "transaction_type",
            "Transaction direction could not be identified.",
            output_field="transaction_direction",
        )

    def _add_metadata_hint(
        self,
        hints: list[ReviewHint],
        record: UniversalFinancialRecord,
        metadata_field: str,
        message: str,
        *,
        output_field: str | None = None,
    ) -> None:
        if self._present(self._first_item_metadata(record, metadata_field)):
            return
        hints.append(
            ReviewHint(
                field=output_field or metadata_field,
                message=message,
            )
        )

    @staticmethod
    def _first_item_metadata(
        record: UniversalFinancialRecord, field_name: str
    ) -> Any:
        for item in record.items:
            if field_name in item.metadata:
                return item.metadata[field_name]
        return None

    @staticmethod
    def _present(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        return True