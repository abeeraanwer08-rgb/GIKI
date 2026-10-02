"""
Deterministic confidence scoring for Universal Financial Records.

This service deliberately has no LLM dependency. It combines the quality
report, document completeness, validation result, and classifier confidence
into one bounded score used for downstream review decisions.
"""

from dataclasses import dataclass
from typing import Any

from schemas.receipt import ImageQualityReport, ReceiptValidationReport
from schemas.ufr import UniversalFinancialRecord


@dataclass(frozen=True)
class ConfidenceResult:
    """Final confidence score and the decision derived from it."""

    confidence: float
    confidence_level: str
    review_required: bool


class ConfidenceService:
    """Calculate deterministic confidence for a generated UFR."""

    QUALITY_WEIGHT = 0.30
    COMPLETENESS_WEIGHT = 0.30
    VALIDATION_WEIGHT = 0.20
    PARSER_WEIGHT = 0.20

    HIGH_THRESHOLD = 0.90
    GOOD_THRESHOLD = 0.80
    MEDIUM_THRESHOLD = 0.60

    # These fields are intentionally document-specific because the UFR keeps
    # wallet and utility fields that have no generic top-level equivalents in
    # item metadata.
    REQUIRED_FIELDS = {
        "receipt": (
            "merchant",
            "document_date",
            "currency",
            "total_amount",
            "items",
        ),
        "utility_bill": (
            "merchant",
            "document_date",
            "currency",
            "total_amount",
            "items",
            "consumer_number",
            "billing_period",
            "due_date",
        ),
        "invoice": (
            "merchant",
            "document_date",
            "currency",
            "total_amount",
            "items",
            "invoice_number",
        ),
        "bank_statement": (
            "merchant",
            "document_date",
            "currency",
            "total_amount",
            "items",
        ),
        "wallet_screenshot": (
            "merchant",
            "document_date",
            "currency",
            "total_amount",
            "items",
            "transaction_type",
            "counterparty",
            "transaction_time",
            "transaction_reference",
        ),
    }

    def calculate(
        self,
        *,
        record: UniversalFinancialRecord,
        quality_report: ImageQualityReport | None,
        validation_report: ReceiptValidationReport | None,
        parser_confidence: str | float | None,
    ) -> ConfidenceResult:
        """
        Calculate the weighted final confidence score.

        Missing inputs contribute zero to their respective factor rather than
        being silently treated as successful evidence.
        """
        quality_factor = self._quality_factor(quality_report)
        completeness_factor = self._completeness_factor(record)
        validation_factor = self._validation_factor(validation_report)
        parser_factor = self._parser_factor(parser_confidence)

        score = (
            quality_factor * self.QUALITY_WEIGHT
            + completeness_factor * self.COMPLETENESS_WEIGHT
            + validation_factor * self.VALIDATION_WEIGHT
            + parser_factor * self.PARSER_WEIGHT
        )
        score = round(self._clamp(score), 4)
        level = self.level_for(score)
        return ConfidenceResult(
            confidence=score,
            confidence_level=level,
            review_required=level in {"MEDIUM", "LOW"},
        )

    @classmethod
    def level_for(cls, score: float) -> str:
        """Map a normalized score to its public confidence level."""
        score = cls._clamp(score)
        if score >= cls.HIGH_THRESHOLD:
            return "HIGH"
        if score >= cls.GOOD_THRESHOLD:
            return "GOOD"
        if score >= cls.MEDIUM_THRESHOLD:
            return "MEDIUM"
        return "LOW"

    def _completeness_factor(self, record: UniversalFinancialRecord) -> float:
        fields = self.REQUIRED_FIELDS.get(
            record.document_type,
            ("merchant", "document_date", "currency", "total_amount", "items"),
        )
        present = sum(
            1 for field_name in fields if self._field_is_present(record, field_name)
        )
        return present / len(fields)

    @staticmethod
    def _field_is_present(record: UniversalFinancialRecord, field_name: str) -> bool:
        if field_name == "items":
            return bool(record.items)

        value: Any = getattr(record, field_name, None)
        if field_name in {
            "consumer_number",
            "billing_period",
            "due_date",
            "transaction_type",
            "counterparty",
            "transaction_time",
            "transaction_reference",
        }:
            value = ConfidenceService._first_item_metadata(record, field_name)

        if field_name == "invoice_number":
            value = record.metadata.details.get("invoice_number")

        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        return True

    @staticmethod
    def _first_item_metadata(
        record: UniversalFinancialRecord, field_name: str
    ) -> Any:
        for item in record.items:
            if field_name in item.metadata:
                return item.metadata[field_name]
        return None

    @staticmethod
    def _quality_factor(report: ImageQualityReport | None) -> float:
        if report is None or not report.passed:
            return 0.0
        return ConfidenceService._clamp(report.quality_score / 100.0)

    @staticmethod
    def _validation_factor(report: ReceiptValidationReport | None) -> float:
        if report is None:
            return 0.0
        return 1.0 if report.valid else 0.0

    @staticmethod
    def _parser_factor(value: str | float | None) -> float:
        if value is None:
            return 0.0
        if isinstance(value, str):
            return {
                "high": 0.9,
                "good": 0.8,
                "medium": 0.6,
                "low": 0.3,
            }.get(value.strip().lower(), 0.0)
        return ConfidenceService._clamp(float(value))

    @staticmethod
    def _clamp(value: float) -> float:
        return max(0.0, min(1.0, value))