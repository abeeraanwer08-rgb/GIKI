"""Validation and persistence for user-approved Universal Financial Records."""

from __future__ import annotations

import math
import uuid
from collections import Counter
from decimal import Decimal, InvalidOperation
from typing import Any

from schemas.ufr import UniversalFinancialRecord
from services.categorization import CategorizationService
from services.statement_dates import to_iso
from services.supabase_client import (
    SupabaseClient,
    SupabaseConflictError,
    get_supabase_client,
)

# Fixed namespace so a statement row's id depends only on its content.
_STATEMENT_ROW_NAMESPACE = uuid.UUID("6f1d3b8e-5a0c-4c53-9a47-2a1f6f0d9a11")


def parse_valid_iso(value: object) -> bool:
    """True for a real YYYY-MM-DD date (and nothing looser, so rows stay sortable)."""
    text = str(value).strip()
    return len(text) == 10 and to_iso(text) == text


class FinancialRecordValidationError(ValueError):
    """Raised when a reviewed UFR fails persistence-specific validation.

    These are hard errors (schema problems, impossible values, missing required
    fields) that cannot be overridden by the user.
    """

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("; ".join(errors))


class FinancialRecordTotalMismatchWarning(ValueError):
    """Raised when totals do not reconcile after accounting for all known charges.

    This is a non-critical arithmetic warning.  The caller may retry with
    ``confirm_total_mismatch=True`` in the record metadata to override.
    The record is NOT persisted on the first attempt when this is raised.
    """

    MESSAGE = (
        "The item amounts do not fully reconcile with the final total. "
        "This may be caused by GST, service charges, discounts, rounding, "
        "or an extraction issue."
    )

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class FinancialRecordPersistenceService:
    """Validate and save a canonical UFR without invoking parsing or AI."""

    # Keep tolerance limited to two-decimal currency rounding. A percentage
    # tolerance could allow a materially incorrect reviewed total to save.
    TOTAL_ROUNDING_TOLERANCE = Decimal("0.01")

    def __init__(
        self,
        client: SupabaseClient | None = None,
        categorizer: CategorizationService | None = None,
    ) -> None:
        self._client = client
        self._categorizer = categorizer or CategorizationService()

    def save(
        self,
        record: UniversalFinancialRecord,
        *,
        user_id: str,
        confirm_total_mismatch: bool = False,
    ) -> int:
        """Validate and insert a UFR, preserving duplicate-ID safety.

        Returns the number of rows stored: 1 for ordinary documents, one per
        spending transaction for a bank statement.

        Raises:
            FinancialRecordValidationError: Hard schema/data errors that cannot
                be overridden.
            FinancialRecordTotalMismatchWarning: Soft arithmetic mismatch.
                Caller may retry with confirm_total_mismatch=True to persist
                anyway; the record will be saved with review_required=True and
                the warning appended to metadata.review_hints.
        """
        self.validate(record)
        self._check_total_reconciliation(record, confirm_total_mismatch)
        if record.document_type == "bank_statement":
            return self._save_statement(record, user_id)
        self._assign_category(record)
        self.client.insert_financial_record(self.to_database_payload(record, user_id))
        return 1

    def _save_statement(self, record: UniversalFinancialRecord, user_id: str) -> int:
        """Store each spending row of a statement as its own record.

        Spending insights group by merchant, category and month, so a 40-row
        statement saved as one lump would be useless to them. Row ids are
        derived from the row's content, which makes re-saving the same
        statement (or an overlapping one) skip rows already stored instead of
        double-counting them.
        """
        rows = self.statement_rows(record, user_id)
        if not rows:
            raise FinancialRecordValidationError(
                ["The statement has no spending transactions to save."]
            )
        inserted = self.client.insert_financial_records(rows, ignore_duplicates=True)
        if inserted == 0:
            raise SupabaseConflictError("Every transaction in this statement is already saved.")
        return inserted

    def statement_rows(
        self, record: UniversalFinancialRecord, user_id: str
    ) -> list[dict[str, Any]]:
        occurrences: Counter[tuple] = Counter()
        rows: list[dict[str, Any]] = []
        for item in record.items:
            if item.amount is None or item.amount <= 0:
                continue
            txn_date = item.metadata.get("date") or record.document_date
            key = (
                txn_date,
                item.description.strip().lower(),
                round(item.amount, 2),
                item.metadata.get("balance"),
            )
            occurrences[key] += 1  # two identical same-day rows are two transactions
            row_id = uuid.uuid5(
                _STATEMENT_ROW_NAMESPACE, "|".join(map(str, (user_id, *key, occurrences[key])))
            )
            if item.category and item.category.strip():
                category = item.category.strip().lower()
            else:
                category = self._categorizer.categorize(
                    document_type=None, merchant=item.description
                ).category
            rows.append(
                {
                    "id": str(row_id),
                    "user_id": user_id,
                    "document_type": record.document_type,
                    "source": record.metadata.source,
                    "transaction_date": txn_date,
                    "merchant_provider": item.description,
                    "amount": item.amount,
                    "currency": record.currency,
                    "category": category,
                    "payment_method": record.payment_method,
                    "items": [item.model_dump(mode="json")],
                    "metadata": {
                        **record.metadata.model_dump(mode="json"),
                        "category_source": "statement_row",
                        "statement_record_id": record.record_id,
                        "bank_name": record.merchant,
                    },
                    "confidence": record.metadata.confidence,
                    "parser_version": record.metadata.parser_version,
                }
            )
        return rows

    def _assign_category(self, record: UniversalFinancialRecord) -> None:
        """Keep a user-chosen category; otherwise derive one so insights can group it."""
        if record.category and record.category.strip():
            record.metadata.category_source = record.metadata.category_source or "user"
            return
        result = self._categorizer.categorize(
            document_type=record.document_type,
            merchant=record.merchant,
            item_descriptions=[item.description for item in record.items],
        )
        record.category = result.category
        record.metadata.category_source = result.source

    @property
    def client(self) -> SupabaseClient:
        return self._client or get_supabase_client()

    @classmethod
    def validate(cls, record: UniversalFinancialRecord) -> None:
        """Apply hard UFR and database consistency checks.

        Only raises FinancialRecordValidationError.  Total reconciliation is
        handled separately in _check_total_reconciliation so that the caller
        can choose to override a mismatch while hard errors remain blocking.
        """
        errors: list[str] = []

        if not record.record_id.strip():
            errors.append("record_id must not be blank.")
        if not record.document_type.strip():
            errors.append("document_type must not be blank.")
        if not record.metadata.source.strip():
            errors.append("metadata.source must not be blank.")
        if not record.metadata.parser_version.strip():
            errors.append("metadata.parser_version must not be blank.")

        numeric_values: list[tuple[str, float | None]] = [
            ("total_amount", record.total_amount),
            ("confidence", record.metadata.confidence),
            ("metadata.subtotal_amount", record.metadata.subtotal_amount),
            ("metadata.tax_amount", record.metadata.tax_amount),
            ("metadata.service_charge", record.metadata.service_charge),
            ("metadata.delivery_charge", record.metadata.delivery_charge),
            ("metadata.discount_amount", record.metadata.discount_amount),
            ("metadata.grand_total_amount", record.metadata.grand_total_amount),
        ]
        for index, item in enumerate(record.items):
            numeric_values.extend(
                [
                    (f"items[{index}].amount", item.amount),
                    (f"items[{index}].quantity", item.quantity),
                    (f"items[{index}].unit_price", item.unit_price),
                ]
            )

        if record.document_type == "bank_statement":
            for index, item in enumerate(record.items, start=1):
                row_date = item.metadata.get("date")
                if row_date not in (None, "") and not parse_valid_iso(row_date):
                    errors.append(
                        f"Transaction {index} has an invalid date '{row_date}'. Use YYYY-MM-DD."
                    )

        for field_name, value in numeric_values:
            if value is not None and not math.isfinite(value):
                errors.append(f"{field_name} must be a finite number.")

        confidence = record.metadata.confidence
        if confidence is not None and not 0 <= confidence <= 1:
            errors.append("metadata.confidence must be between 0 and 1.")

        # Negative charge/discount values are hard errors.
        if record.metadata.tax_amount is not None and record.metadata.tax_amount < 0:
            errors.append("metadata.tax_amount must not be negative.")
        if record.metadata.service_charge is not None and record.metadata.service_charge < 0:
            errors.append("metadata.service_charge must not be negative.")
        if record.metadata.delivery_charge is not None and record.metadata.delivery_charge < 0:
            errors.append("metadata.delivery_charge must not be negative.")
        if record.metadata.discount_amount is not None and record.metadata.discount_amount < 0:
            errors.append("metadata.discount_amount must not be negative.")

        if errors:
            raise FinancialRecordValidationError(errors)

    @classmethod
    def _check_total_reconciliation(
        cls,
        record: UniversalFinancialRecord,
        confirm_total_mismatch: bool,
    ) -> None:
        """Check arithmetic reconciliation.

        Reconciliation formula:
            expected = base + tax + service_charge + delivery_charge − discount

        where base is determined as follows:
          1. If subtotal_amount is declared, use it (items may be incomplete).
          2. Else if every item amount is present, use the item sum.
          3. Otherwise there is no reliable base — skip reconciliation entirely.

        Item-vs-subtotal consistency is only checked when every item amount is
        available (partial extraction is normal; we never hard-fail on it).

        If the mismatch is within TOTAL_ROUNDING_TOLERANCE it passes silently.
        If it exceeds the tolerance AND confirm_total_mismatch is False, raises
        FinancialRecordTotalMismatchWarning (non-blocking; caller may retry).
        If it exceeds the tolerance AND confirm_total_mismatch is True, mutates
        the record (review_required=True, warning in review_hints) and returns
        normally so the caller can persist.
        """
        if record.total_amount is None:
            return

        item_amounts = [item.amount for item in record.items]
        all_items_present = bool(item_amounts) and all(
            a is not None for a in item_amounts
        )

        # ── Determine the base amount ─────────────────────────────────────────
        if record.metadata.subtotal_amount is not None:
            # Declared subtotal takes precedence — usable even with partial items.
            base = cls._decimal(record.metadata.subtotal_amount)

            # Only cross-check items vs subtotal when every amount is readable.
            if all_items_present:
                calculated_item_sum = sum(
                    cls._decimal(a) for a in item_amounts if a is not None
                )
                subtotal_diff = abs(calculated_item_sum - base)
                if subtotal_diff > cls.TOTAL_ROUNDING_TOLERANCE:
                    raise FinancialRecordValidationError(
                        ["subtotal_amount does not reconcile with the submitted item amounts."]
                    )

        elif all_items_present:
            # No declared subtotal — derive base from the complete item list.
            base = sum(
                cls._decimal(a) for a in item_amounts if a is not None
            )

        else:
            # Neither subtotal nor a complete item list — cannot reconcile.
            return

        # ── Final-total reconciliation ────────────────────────────────────────
        expected_total = (
            base
            + (cls._decimal(record.metadata.tax_amount) if record.metadata.tax_amount is not None else Decimal("0"))
            + (cls._decimal(record.metadata.service_charge) if record.metadata.service_charge is not None else Decimal("0"))
            + (cls._decimal(record.metadata.delivery_charge) if record.metadata.delivery_charge is not None else Decimal("0"))
            - (cls._decimal(record.metadata.discount_amount) if record.metadata.discount_amount is not None else Decimal("0"))
        )

        submitted_total = cls._decimal(record.total_amount)
        difference = abs(expected_total - submitted_total)

        if difference <= cls.TOTAL_ROUNDING_TOLERANCE:
            return

        # Arithmetic mismatch beyond rounding tolerance.
        if not confirm_total_mismatch:
            raise FinancialRecordTotalMismatchWarning()

        # User confirmed — mark the record for review and continue.
        from schemas.ufr import ReviewHint  # local import avoids circularity
        record.metadata.review_required = True
        record.metadata.review_hints = list(record.metadata.review_hints) + [
            ReviewHint(
                field="total_amount",
                message=FinancialRecordTotalMismatchWarning.MESSAGE,
            )
        ]

    @staticmethod
    def to_database_payload(record: UniversalFinancialRecord, user_id: str) -> dict[str, Any]:
        """Map UFR fields to the financial_records columns, owned by ``user_id``."""
        return {
            "id": record.record_id,
            "user_id": user_id,
            "document_type": record.document_type,
            "source": record.metadata.source,
            "transaction_date": record.document_date,
            "merchant_provider": record.merchant,
            "amount": record.total_amount,
            "currency": record.currency,
            "category": record.category,
            "payment_method": record.payment_method,
            "items": [
                item.model_dump(mode="json")
                for item in record.items
            ],
            "metadata": record.metadata.model_dump(mode="json"),
            "confidence": record.metadata.confidence,
            "parser_version": record.metadata.parser_version,
        }

    @staticmethod
    def _decimal(value: float) -> Decimal:
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError) as exc:
            raise FinancialRecordValidationError(
                ["Financial record contains an invalid numeric value."]
            ) from exc
