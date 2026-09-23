"""Deterministic aggregation over persisted Universal Financial Records.

These calculations never call the LLM. They exist so that AI financial
reasoning (see ``services/financial_reasoning.py``) has a grounded, reusable
summary to reason over instead of raw records or model-invented numbers.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from pydantic import BaseModel, Field


class CategoryTotal(BaseModel):
    category: str
    total_amount: float
    record_count: int


class MonthlyTotal(BaseModel):
    month: str  # YYYY-MM
    total_amount: float
    record_count: int


class FinancialSummary(BaseModel):
    """Deterministic spending summary computed from stored financial records."""

    record_count: int
    total_amount: float
    currency: str | None = None
    by_category: list[CategoryTotal] = Field(default_factory=list)
    by_month: list[MonthlyTotal] = Field(default_factory=list)
    top_merchants: list[CategoryTotal] = Field(default_factory=list)


class FinancialCalculationsService:
    """Computes a deterministic FinancialSummary from raw stored record rows."""

    UNCATEGORIZED = "uncategorized"

    def summarize(self, records: list[dict[str, Any]]) -> FinancialSummary:
        category_totals: dict[str, list[float]] = defaultdict(list)
        month_totals: dict[str, list[float]] = defaultdict(list)
        merchant_totals: dict[str, list[float]] = defaultdict(list)
        total_amount = 0.0
        currency: str | None = None

        for record in records:
            amount = record.get("amount")
            if amount is None:
                continue
            amount = float(amount)
            total_amount += amount

            if currency is None and record.get("currency"):
                currency = record["currency"]

            category = record.get("category") or self.UNCATEGORIZED
            category_totals[category].append(amount)

            merchant = record.get("merchant_provider")
            if merchant:
                merchant_totals[merchant].append(amount)

            month = self._month_key(record.get("transaction_date"))
            if month is not None:
                month_totals[month].append(amount)

        return FinancialSummary(
            record_count=len(records),
            total_amount=round(total_amount, 2),
            currency=currency,
            by_category=self._to_totals(category_totals),
            by_month=[
                MonthlyTotal(
                    month=month,
                    total_amount=round(sum(amounts), 2),
                    record_count=len(amounts),
                )
                for month, amounts in sorted(month_totals.items())
            ],
            top_merchants=self._to_totals(merchant_totals, limit=5),
        )

    @staticmethod
    def _to_totals(
        totals: dict[str, list[float]], *, limit: int | None = None
    ) -> list[CategoryTotal]:
        rows = [
            CategoryTotal(
                category=key,
                total_amount=round(sum(amounts), 2),
                record_count=len(amounts),
            )
            for key, amounts in totals.items()
        ]
        rows.sort(key=lambda row: row.total_amount, reverse=True)
        return rows[:limit] if limit is not None else rows

    @staticmethod
    def _month_key(transaction_date: str | None) -> str | None:
        if not transaction_date or len(transaction_date) < 7:
            return None
        return transaction_date[:7]
