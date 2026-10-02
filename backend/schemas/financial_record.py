"""Schemas for the reviewed financial-record persistence endpoint."""

from typing import Any

from pydantic import BaseModel


class FinancialRecordSaveResponse(BaseModel):
    """Small deterministic response returned after a successful save."""

    saved: bool
    record_id: str
    document_type: str
    category: str | None = None
    # 1 for most documents; one per spending transaction for a bank statement.
    records_saved: int = 1


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
    """One page of saved records, most recent first."""

    records: list[FinancialRecordSummary]
    total: int = 0  # records matching the filters, across all pages
    limit: int = 0
    offset: int = 0
    has_more: bool = False


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