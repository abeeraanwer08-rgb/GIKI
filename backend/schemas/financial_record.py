"""Schemas for the reviewed financial-record persistence endpoint."""

from typing import Any

from pydantic import BaseModel


class FinancialRecordSaveResponse(BaseModel):
    """Small deterministic response returned after a successful save."""

    saved: bool
    record_id: str
    document_type: str
    category: str | None = None


class FinancialRecordSummary(BaseModel):
    """One saved record, shaped for a mobile transaction list."""

    id: str
    document_type: str
    merchant: str | None = None
    transaction_date: str | None = None
    amount: float | None = None
    currency: str | None = None
    category: str | None = None


class FinancialRecordListResponse(BaseModel):
    """Saved records, most recent first."""

    records: list[FinancialRecordSummary]


def to_summary(row: dict[str, Any], category: str | None = None) -> FinancialRecordSummary:
    """Map a raw stored record row to the mobile-facing summary shape."""
    return FinancialRecordSummary(
        id=row["id"],
        document_type=row["document_type"],
        merchant=row.get("merchant_provider"),
        transaction_date=row.get("transaction_date"),
        amount=row.get("amount"),
        currency=row.get("currency"),
        category=category or row.get("category"),
    )