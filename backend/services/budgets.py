"""Deterministic monthly budget tracking per spending category."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field

from services.categorization import CategorizationService

BudgetState = Literal["on_track", "warning", "over"]


class BudgetStatus(BaseModel):
    category: str
    monthly_limit: float
    spent: float
    remaining: float
    percent_used: float
    status: BudgetState


class BudgetOverview(BaseModel):
    month: str  # YYYY-MM
    currency: str
    total_limit: float
    total_spent: float
    alerts: int
    budgets: list[BudgetStatus] = Field(default_factory=list)


class BudgetService:
    """Compares this month's spending per category against its budget."""

    WARNING_THRESHOLD = 80.0

    def __init__(self, categorizer: CategorizationService | None = None) -> None:
        self._categorizer = categorizer or CategorizationService()

    def overview(
        self,
        budget_rows: list[dict[str, Any]],
        record_rows: list[dict[str, Any]],
        today: date | None = None,
    ) -> BudgetOverview:
        today = today or date.today()
        month = today.strftime("%Y-%m")

        spent_by_category: dict[str, float] = defaultdict(float)
        for row in record_rows:
            if row.get("amount") is None or not str(row.get("transaction_date") or "").startswith(month):
                continue
            spent_by_category[self._categorizer.categorize_row(row)] += float(row["amount"])

        statuses = [
            self._status(row["category"], float(row["monthly_limit"]), spent_by_category[row["category"]])
            for row in budget_rows
        ]
        statuses.sort(key=lambda s: s.percent_used, reverse=True)

        currency = next((r["currency"] for r in budget_rows if r.get("currency")), "PKR")
        return BudgetOverview(
            month=month,
            currency=currency,
            total_limit=round(sum(s.monthly_limit for s in statuses), 2),
            total_spent=round(sum(s.spent for s in statuses), 2),
            alerts=sum(1 for s in statuses if s.status != "on_track"),
            budgets=statuses,
        )

    def _status(self, category: str, limit: float, spent: float) -> BudgetStatus:
        percent = round(spent / limit * 100, 1) if limit > 0 else 0.0
        state: BudgetState = (
            "over" if percent >= 100 else "warning" if percent >= self.WARNING_THRESHOLD else "on_track"
        )
        return BudgetStatus(
            category=category,
            monthly_limit=round(limit, 2),
            spent=round(spent, 2),
            remaining=round(limit - spent, 2),
            percent_used=percent,
            status=state,
        )
