from __future__ import annotations

import unittest
from datetime import date
from typing import Any

import httpx
from fastapi.testclient import TestClient

from main import app
from routes.auth import get_current_user
from services.tokens import TokenUser
from routes.budgets import get_budget_service, get_supabase_dependency
from services.budgets import BudgetService
from services.supabase_client import SupabaseClient, SupabaseConnectionError

TODAY = date(2026, 9, 20)

RECORDS = [
    {"amount": 7000.0, "category": "groceries", "transaction_date": "2026-09-03"},
    {"amount": 1500.0, "category": "groceries", "transaction_date": "2026-09-15"},
    {"amount": 900.0, "category": None, "merchant_provider": "Cheezious", "transaction_date": "2026-09-10"},
    {"amount": 6200.0, "category": "utilities", "transaction_date": "2026-09-12"},
    {"amount": 5000.0, "category": "groceries", "transaction_date": "2026-08-28"},  # last month
]


class BudgetServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = BudgetService()

    def test_statuses_reflect_this_months_spending_only(self):
        overview = self.service.overview(
            [
                {"category": "groceries", "monthly_limit": 10000, "currency": "PKR"},
                {"category": "restaurant", "monthly_limit": 1000, "currency": "PKR"},
                {"category": "utilities", "monthly_limit": 5000, "currency": "PKR"},
                {"category": "transport", "monthly_limit": 3000, "currency": "PKR"},
            ],
            RECORDS,
            today=TODAY,
        )
        by_category = {b.category: b for b in overview.budgets}

        self.assertEqual(by_category["groceries"].spent, 8500.0)
        self.assertEqual(by_category["groceries"].status, "warning")  # 85%
        self.assertEqual(by_category["restaurant"].spent, 900.0)  # derived from merchant
        self.assertEqual(by_category["restaurant"].status, "warning")  # 90%
        self.assertEqual(by_category["utilities"].status, "over")
        self.assertEqual(by_category["utilities"].remaining, -1200.0)
        self.assertEqual(by_category["transport"].status, "on_track")
        self.assertEqual(overview.alerts, 3)
        self.assertEqual(overview.month, "2026-09")
        self.assertEqual(overview.total_limit, 19000.0)
        # Most-used budget first.
        self.assertEqual(overview.budgets[0].category, "utilities")

    def test_no_budgets_gives_empty_overview(self):
        overview = self.service.overview([], RECORDS, today=TODAY)
        self.assertEqual((overview.budgets, overview.alerts, overview.total_limit), ([], 0, 0.0))


class FakeBudgetStore:
    def __init__(self) -> None:
        self.budgets: dict[str, dict[str, Any]] = {}
        self.error: Exception | None = None

    def _check(self) -> None:
        if self.error:
            raise self.error

    def list_budgets(self, user_id: str) -> list[dict[str, Any]]:
        self._check()
        return list(self.budgets.values())

    def list_financial_records(self, user_id: str, *, limit: int = 500) -> list[dict[str, Any]]:
        self._check()
        return [{"amount": 400.0, "category": "groceries", "transaction_date": date.today().isoformat()}]

    def upsert_budget(self, payload: dict[str, Any]) -> None:
        self._check()
        self.budgets[payload["category"]] = payload

    def delete_budget(self, user_id: str, category: str) -> None:
        self._check()
        self.budgets.pop(category, None)


class BudgetEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = FakeBudgetStore()
        app.dependency_overrides[get_supabase_dependency] = lambda: self.store
        app.dependency_overrides[get_budget_service] = lambda: BudgetService()
        app.dependency_overrides[get_current_user] = lambda: TokenUser("user-1", "ali@example.com", "Ali")
        self.http = TestClient(app)

    def tearDown(self) -> None:
        self.http.close()
        app.dependency_overrides.clear()

    def test_set_then_list_then_delete_budget(self):
        response = self.http.put("/api/v1/budgets/Groceries", json={"monthly_limit": 1000})
        self.assertEqual(response.status_code, 200)
        budget = response.json()["budgets"][0]
        self.assertEqual((budget["category"], budget["spent"], budget["percent_used"]), ("groceries", 400.0, 40.0))

        self.assertEqual(len(self.http.get("/api/v1/budgets").json()["budgets"]), 1)

        response = self.http.delete("/api/v1/budgets/groceries")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["budgets"], [])

    def test_unknown_category_is_rejected(self):
        response = self.http.put("/api/v1/budgets/crypto", json={"monthly_limit": 1000})
        self.assertEqual(response.status_code, 422)
        self.assertIn("groceries", response.json()["detail"]["categories"])

    def test_non_positive_limit_is_rejected(self):
        response = self.http.put("/api/v1/budgets/groceries", json={"monthly_limit": 0})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.store.budgets, {})

    def test_storage_failure_returns_503(self):
        self.store.error = SupabaseConnectionError("down")
        self.assertEqual(self.http.get("/api/v1/budgets").status_code, 503)


class SupabaseBudgetRequestTests(unittest.TestCase):
    def test_upsert_sends_merge_header_and_delete_targets_category(self):
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(201 if request.method == "POST" else 204)

        client = SupabaseClient(
            url="https://example.supabase.co",
            service_role_key="server-key",
            http_client=httpx.Client(
                base_url="https://example.supabase.co", transport=httpx.MockTransport(handler)
            ),
        )
        client.upsert_budget({"user_id": "user-1", "category": "groceries", "monthly_limit": 1000})
        client.delete_budget("user-1", "groceries")

        self.assertEqual(seen[0].headers["prefer"], "resolution=merge-duplicates")
        self.assertEqual(seen[0].headers["apikey"], "server-key")
        self.assertEqual(seen[1].method, "DELETE")
        self.assertEqual(seen[1].url.params["category"], "eq.groceries")
        self.assertEqual(seen[1].url.params["user_id"], "eq.user-1")
        self.assertEqual(seen[0].url.params["on_conflict"], "user_id,category")
        client.close()


if __name__ == "__main__":
    unittest.main()
