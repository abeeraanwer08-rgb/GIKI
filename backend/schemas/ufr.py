"""
Universal Financial Record (UFR) schema.

UFR is the canonical internal representation for financial documents. Parsers
for receipts, utility bills, wallet screenshots, bank statements, and future
document types should map their output into this schema before downstream
storage, calculations, or reasoning are added.
"""

from typing import Any, List, Optional

from pydantic import BaseModel, Field


class UniversalFinancialRecordItem(BaseModel):
    """Generic line item that can represent a purchase or a transaction."""

    description: str
    amount: Optional[float] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    category: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReviewHint(BaseModel):
    """A deterministic field-level explanation for human review."""

    field: str
    message: str


class UniversalFinancialRecordMetadata(BaseModel):
    """Processing provenance, quality, and deterministic review information."""

    source: str
    confidence: Optional[float] = None
    confidence_level: Optional[str] = None
    review_required: Optional[bool] = None
    review_hints: List[ReviewHint] = Field(default_factory=list)
    quality_score: Optional[int] = None
    subtotal_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    service_charge: Optional[float] = None
    delivery_charge: Optional[float] = None
    discount_amount: Optional[float] = None
    grand_total_amount: Optional[float] = None
    parser_version: str
    confirm_total_mismatch: Optional[bool] = None
    category_source: Optional[str] = None
    # Document-specific facts that have no generic field (e.g. statement period).
    details: dict[str, Any] = Field(default_factory=dict)


class UniversalFinancialRecord(BaseModel):
    """
    Canonical internal financial record shared by all document parsers.

    Fields are intentionally document-agnostic. For example, ``merchant`` may
    be a utility provider, ``items`` may contain bank transactions, and
    ``payment_method`` may remain unset when a source document does not expose
    it.
    """

    record_id: str
    document_type: str
    merchant: Optional[str] = None
    document_date: Optional[str] = None
    currency: Optional[str] = None
    total_amount: Optional[float] = None
    payment_method: Optional[str] = None
    category: Optional[str] = None
    items: List[UniversalFinancialRecordItem] = Field(default_factory=list)
    metadata: UniversalFinancialRecordMetadata