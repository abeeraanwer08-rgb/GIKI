"""Strongly typed output schema for invoice extraction."""

from typing import Optional

from pydantic import BaseModel, Field


class InvoiceLine(BaseModel):
    description: str = ""
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None


class InvoiceAnalysisResponse(BaseModel):
    """Structured invoice extraction result (all fields nullable except metadata)."""

    status: str
    filename: str
    content_type: str
    size_bytes: int
    message: str

    vendor_name: Optional[str] = None
    vendor_tax_id: Optional[str] = None  # NTN / STRN printed on the invoice
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None  # YYYY-MM-DD
    due_date: Optional[str] = None  # YYYY-MM-DD
    payment_terms: Optional[str] = None
    currency: Optional[str] = None
    lines: list[InvoiceLine] = Field(default_factory=list)
    subtotal_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    discount_amount: Optional[float] = None
    shipping_amount: Optional[float] = None
    total_amount: Optional[float] = None
