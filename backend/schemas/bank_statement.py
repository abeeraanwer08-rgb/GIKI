"""Strongly typed output schema for bank statement extraction."""

from typing import Optional

from pydantic import BaseModel, Field


class BankTransaction(BaseModel):
    """One statement row. Exactly one of ``debit`` / ``credit`` is normally set."""

    date: Optional[str] = None  # YYYY-MM-DD
    description: str = ""
    debit: Optional[float] = None  # money out (spending)
    credit: Optional[float] = None  # money in
    balance: Optional[float] = None  # running balance after the row, if printed
    reference: Optional[str] = None


class BankStatementAnalysisResponse(BaseModel):
    """Structured bank statement extraction result."""

    status: str
    filename: str
    content_type: str
    size_bytes: int
    message: str

    bank_name: Optional[str] = None
    account_last4: Optional[str] = None  # only the last 4 digits are ever kept
    currency: Optional[str] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    opening_balance: Optional[float] = None
    closing_balance: Optional[float] = None
    stated_total_debits: Optional[float] = None
    stated_total_credits: Optional[float] = None
    transactions: list[BankTransaction] = Field(default_factory=list)
