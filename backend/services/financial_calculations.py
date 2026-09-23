"""Deterministic aggregation over persisted Universal Financial Records.

These calculations never call the LLM. They exist so that AI financial
reasoning (see ``services/financial_reasoning.py``) has a grounded, reusable
summary to reason over instead of raw records or model-invented numbers.
"""

from __future__ import annotations

import calendar
import statistics
from collections import defaultdict
from datetime import date
from typing import Any

from pydantic import BaseModel, Field

from services.categorization import CategorizationService


class CategoryTotal(BaseModel):
    category: str
    total_amount: float
    record_count: int


class MonthlyTotal(BaseModel):
    month: str  # YYYY-MM
    total_amount: float
    record_count: int


class MonthForecast(BaseModel):
    """Month-to-date spending and a straight-line projection to month end."""

    month: str  # YYYY-MM
    spent_to_date: float
    days_elapsed: int
    days_in_month: int
    projected_total: float


class SpendingAnomaly(BaseModel):
    """A record far above what is typical for its category."""

    record_id: str | None = None
    merchant: str | None = None
    category: str
    amount: float
    typical_amount: float  # median of the other records in the category
    ratio: float
    transaction_date: str | None = None


class FinancialSummary(BaseModel):
    """Deterministic spending summary computed from stored financial records."""

    record_count: int
    total_amount: float
    currency: str | None = None
    by_category: list[CategoryTotal] = Field(default_factory=list)
    by_month: list[MonthlyTotal] = Field(default_factory=list)
    top_merchants: list[CategoryTotal] = Field(default_factory=list)
    current_month: MonthForecast | None = None
    anomalies: list[SpendingAnomaly] = Field(default_factory=list)


class FinancialCalculationsService:
    """Computes a deterministic FinancialSummary from raw stored record rows."""

    # A record is unusual when it is at least this many times the median of the
    # other records in its category. Needs enough history to define "typical".
    ANOMALY_RATIO = 2.0
    ANOMALY_MIN_OTHERS = 2
    MAX_ANOMALIES = 5

    def __init__(self, categorizer: CategorizationService | None = None) -> None:
        self._categorizer = categorizer or CategorizationService()

    def summarize(self, records: list[dict[str, Any]], today: date | None = None) -> FinancialSummary:
        today = today or date.today()
        category_totals: dict[str, list[float]] = defaultdict(list)
        month_totals: dict[str, list[float]] = defaultdict(list)
        merchant_totals: dict[str, list[float]] = defaultdict(list)
        by_category_rows: dict[str, list[tuple[dict[str, Any], float]]] = defaultdict(list)
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

            category = self._categorizer.categorize_row(record)
            category_totals[category].append(amount)
            by_category_rows[category].append((record, amount))

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
            current_month=self._forecast(month_totals, today) if records else None,
            anomalies=self._anomalies(by_category_rows),
        )

    @staticmethod
    def _forecast(month_totals: dict[str, list[float]], today: date) -> MonthForecast:
        month = today.strftime("%Y-%m")
        spent = round(sum(month_totals.get(month, [])), 2)
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        projected = round(spent / today.day * days_in_month, 2)
        return MonthForecast(
            month=month,
            spent_to_date=spent,
            days_elapsed=today.day,
            days_in_month=days_in_month,
            projected_total=projected,
        )

    def _anomalies(
        self, by_category_rows: dict[str, list[tuple[dict[str, Any], float]]]
    ) -> list[SpendingAnomaly]:
        found: list[SpendingAnomaly] = []
        for category, rows in by_category_rows.items():
            if len(rows) < self.ANOMALY_MIN_OTHERS + 1:
                continue
            for index, (record, amount) in enumerate(rows):
                others = [a for i, (_, a) in enumerate(rows) if i != index]
                typical = statistics.median(others)
                if typical > 0 and amount >= self.ANOMALY_RATIO * typical:
                    found.append(
                        SpendingAnomaly(
                            record_id=record.get("id"),
                            merchant=record.get("merchant_provider"),
                            category=category,
                            amount=round(amount, 2),
                            typical_amount=round(typical, 2),
                            ratio=round(amount / typical, 1),
                            transaction_date=record.get("transaction_date"),
                        )
                    )
        found.sort(key=lambda a: a.ratio, reverse=True)
        return found[: self.MAX_ANOMALIES]

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
