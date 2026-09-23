from __future__ import annotations

import unittest
from typing import Any

from fastapi.testclient import TestClient

from main import app
from routes.insights import (
    get_calculations_service,
    get_reasoning_service,
    get_supabase_dependency,
)
from services.financial_calculations import FinancialCalculationsService, FinancialSummary
from services.financial_reasoning import FinancialReasoningError
from services.supabase_client import SupabaseConnectionError


class FakeSupabaseClient:
    """In-memory record source; no test reads from real Supabase."""

    def __init__(
        self,
        records: list[dict[str, Any]] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.records = records if records is not None else []
        self.error = error

    def list_financial_records(self, *, limit: int = 500) -> list[dict[str, Any]]:
        if self.error is not None:
            raise self.error
        return self.records


class FakeReasoningService:
    """Spy that never calls OpenAI; returns a canned or forced-error response."""

    def __init__(
        self,
        insights_response: dict | None = None,
        ask_response: dict | None = None,
        error: FinancialReasoningError | None = None,
    ) -> None:
        self.insights_response = insights_response or {
            "headline": "Spending is steady this period.",
            "insights": ["Groceries is your top category."],
            "recommendations": ["Consider a monthly groceries budget."],
        }
        self.ask_response = ask_response or {"answer": "You spent PKR 1000 total."}
        self.error = error
        self.summaries_seen: list[FinancialSummary] = []
        self.questions_seen: list[str] = []

    async def generate_insights(self, summary: FinancialSummary) -> dict:
        self.summaries_seen.append(summary)
        if self.error is not None:
            raise self.error
        return self.insights_response

    async def answer_question(self, summary: FinancialSummary, question: str) -> dict:
        self.summaries_seen.append(summary)
        self.questions_seen.append(question)
        if self.error is not None:
            raise self.error
        return self.ask_response


class InsightsEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.supabase = FakeSupabaseClient(
            records=[
                {
                    "amount": 500.0,
                    "currency": "PKR",
                    "category": "groceries",
                    "merchant_provider": "Karachi Grocers",
                    "transaction_date": "2026-08-12",
                },
                {
                    "amount": 500.0,
                    "currency": "PKR",
                    "category": "groceries",
                    "merchant_provider": "Karachi Grocers",
                    "transaction_date": "2026-08-20",
                },
            ]
        )
        self.reasoning = FakeReasoningService()
        app.dependency_overrides[get_supabase_dependency] = lambda: self.supabase
        app.dependency_overrides[get_calculations_service] = (
            lambda: FinancialCalculationsService()
        )
        app.dependency_overrides[get_reasoning_service] = lambda: self.reasoning
        self.http = TestClient(app)

    def tearDown(self) -> None:
        self.http.close()
        app.dependency_overrides.clear()

    def test_get_insights_returns_deterministic_summary_and_ai_narrative(self):
        response = self.http.get("/api/v1/insights")
        self.assertEqual(response.status_code, 200)
        body = response.json()

        self.assertEqual(body["summary"]["record_count"], 2)
        self.assertEqual(body["summary"]["total_amount"], 1000.0)
        self.assertEqual(body["headline"], "Spending is steady this period.")
        self.assertEqual(
            body["recommendations"], ["Consider a monthly groceries budget."]
        )
        # The reasoning service only ever saw the deterministic summary.
        self.assertEqual(len(self.reasoning.summaries_seen), 1)
        self.assertEqual(self.reasoning.summaries_seen[0].total_amount, 1000.0)

    def test_get_insights_returns_503_when_storage_is_unavailable(self):
        self.supabase.error = SupabaseConnectionError("simulated database failure")
        response = self.http.get("/api/v1/insights")
        self.assertEqual(response.status_code, 503)

    def test_get_insights_returns_503_when_reasoning_is_unavailable(self):
        self.reasoning.error = FinancialReasoningError(
            "OPENAI_API_KEY is not configured; AI reasoning is unavailable."
        )
        response = self.http.get("/api/v1/insights")
        self.assertEqual(response.status_code, 503)

    def test_summary_endpoint_is_deterministic_and_skips_the_llm(self):
        response = self.http.get("/api/v1/insights/summary")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total_amount"], 1000.0)
        self.assertIn("current_month", body)
        self.assertIn("anomalies", body)
        self.assertEqual(self.reasoning.summaries_seen, [])

    def test_ask_answers_grounded_in_summary(self):
        response = self.http.post(
            "/api/v1/insights/ask", json={"question": "How much did I spend?"}
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["question"], "How much did I spend?")
        self.assertEqual(body["answer"], "You spent PKR 1000 total.")
        self.assertEqual(self.reasoning.questions_seen, ["How much did I spend?"])

    def test_ask_rejects_blank_question(self):
        response = self.http.post("/api/v1/insights/ask", json={"question": "   "})
        self.assertEqual(response.status_code, 422)

    def test_ask_returns_503_when_reasoning_is_unavailable(self):
        self.reasoning.error = FinancialReasoningError("unavailable")
        response = self.http.post(
            "/api/v1/insights/ask", json={"question": "How much did I spend?"}
        )
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
