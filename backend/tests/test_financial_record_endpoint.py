from __future__ import annotations

import unittest
from typing import Any

from fastapi.testclient import TestClient

from main import app
from routes.auth import get_current_user
from services.tokens import TokenUser
from schemas.ufr import (
    UniversalFinancialRecord,
    UniversalFinancialRecordItem,
    UniversalFinancialRecordMetadata,
)
from routes.financial_records import (
    get_financial_record_persistence_service,
    get_supabase_dependency,
)
from services.financial_record_persistence import FinancialRecordPersistenceService
from services.supabase_client import (
    SupabaseClient,
    SupabaseConflictError,
    SupabaseConnectionError,
)


class FakeSupabaseClient:
    """In-memory insert/list spy; no test writes to or reads from Supabase."""

    def __init__(
        self,
        error: Exception | None = None,
        records: list[dict[str, Any]] | None = None,
    ) -> None:
        self.payloads: list[dict[str, Any]] = []
        self.error = error
        self.records = records if records is not None else []

    def insert_financial_record(self, payload: dict[str, Any]) -> None:
        if self.error is not None:
            raise self.error
        self.payloads.append(payload)

    def list_financial_records(self, user_id: str, *, limit: int = 500) -> list[dict[str, Any]]:
        if self.error is not None:
            raise self.error
        return self.records


def make_record(
    *,
    record_id: str = "record-1",
    document_type: str = "receipt",
    source: str = "receipt_analysis",
    merchant: str = "Karachi Grocers",
    total_amount: float = 450.50,
    category: str = "groceries",
    items: list[UniversalFinancialRecordItem] | None = None,
    service_charge: float | None = None,
    tax_amount: float | None = None,
    delivery_charge: float | None = None,
    discount_amount: float | None = None,
    subtotal_amount: float | None = None,
    confirm_total_mismatch: bool | None = None,
) -> UniversalFinancialRecord:
    if items is None:
        items = [
            UniversalFinancialRecordItem(
                description="Rice",
                amount=300.00,
                quantity=1,
                unit_price=300.00,
                category="groceries",
            ),
            UniversalFinancialRecordItem(
                description="Tea",
                amount=150.50,
                quantity=1,
                unit_price=150.50,
                category="groceries",
            ),
        ]

    return UniversalFinancialRecord(
        record_id=record_id,
        document_type=document_type,
        merchant=merchant,
        document_date="2026-08-12",
        currency="PKR",
        total_amount=total_amount,
        payment_method=None,
        category=category,
        items=items,
        metadata=UniversalFinancialRecordMetadata(
            source=source,
            confidence=0.9,
            confidence_level="high",
            review_required=False,
            parser_version="test-parser-v1",
            service_charge=service_charge,
            tax_amount=tax_amount,
            delivery_charge=delivery_charge,
            discount_amount=discount_amount,
            subtotal_amount=subtotal_amount,
            confirm_total_mismatch=confirm_total_mismatch,
        ),
    )


class FinancialRecordEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = FakeSupabaseClient()
        self.persistence = FinancialRecordPersistenceService(
            client=self.client,  # type: ignore[arg-type]
        )
        app.dependency_overrides[
            get_financial_record_persistence_service
        ] = lambda: self.persistence
        app.dependency_overrides[get_supabase_dependency] = lambda: self.client
        app.dependency_overrides[get_current_user] = lambda: TokenUser("user-1", "ali@example.com", "Ali")
        self.http = TestClient(app)

    def tearDown(self) -> None:
        self.http.close()
        app.dependency_overrides.clear()

    def post_record(self, record: UniversalFinancialRecord):
        return self.http.post(
            "/api/v1/financial-records",
            json=record.model_dump(mode="json"),
        )

    # ── TEST A — normal receipt ───────────────────────────────────────────────

    def test_A_normal_receipt_saves_successfully(self):
        """Items total = 1000, total_amount = 1000 → HTTP 201."""
        record = make_record(
            record_id="test-a",
            total_amount=1000.0,
            items=[
                UniversalFinancialRecordItem(
                    description="Item A", amount=600.0, category="groceries"
                ),
                UniversalFinancialRecordItem(
                    description="Item B", amount=400.0, category="groceries"
                ),
            ],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["saved"], True)
        self.assertEqual(len(self.client.payloads), 1)

    # ── TEST B — service-charge receipt ──────────────────────────────────────

    def test_B_service_charge_receipt_saves_successfully(self):
        """items/subtotal = 7650, service_charge = 765, total = 8415 → HTTP 201."""
        record = make_record(
            record_id="test-b",
            total_amount=8415.0,
            service_charge=765.0,
            items=[
                UniversalFinancialRecordItem(
                    description="Chicken Karahi",
                    amount=5250.0,
                    category="restaurant",
                ),
                UniversalFinancialRecordItem(
                    description="Seekh Kebab",
                    amount=1400.0,
                    category="restaurant",
                ),
                UniversalFinancialRecordItem(
                    description="Soft Drink",
                    amount=1000.0,
                    category="restaurant",
                ),
            ],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["record_id"], "test-b")
        self.assertEqual(self.client.payloads[0]["amount"], 8415.0)
        self.assertEqual(self.client.payloads[0]["metadata"]["service_charge"], 765.0)

    # ── TEST C — GST receipt ──────────────────────────────────────────────────

    def test_C_gst_receipt_saves_successfully(self):
        """subtotal = 1000, tax = 150, total = 1150 → HTTP 201."""
        record = make_record(
            record_id="test-c",
            total_amount=1150.0,
            tax_amount=150.0,
            items=[
                UniversalFinancialRecordItem(
                    description="Taxable item", amount=1000.0, category="food"
                ),
            ],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.payloads[0]["metadata"]["tax_amount"], 150.0)

    # ── TEST D — discount receipt ─────────────────────────────────────────────

    def test_D_discount_receipt_saves_successfully(self):
        """subtotal = 1000, discount = 100, total = 900 → HTTP 201."""
        record = make_record(
            record_id="test-d",
            total_amount=900.0,
            discount_amount=100.0,
            items=[
                UniversalFinancialRecordItem(
                    description="Discounted item", amount=1000.0, category="food"
                ),
            ],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.payloads[0]["metadata"]["discount_amount"], 100.0)

    # ── TEST E — mismatch without confirmation ────────────────────────────────

    def test_E_mismatch_without_confirmation_returns_total_mismatch(self):
        """Totals don't reconcile → HTTP 409 total_mismatch, record NOT persisted."""
        record = make_record(
            record_id="test-e",
            total_amount=9999.0,  # items sum to 450.50
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 409)
        detail = response.json()["detail"]
        self.assertEqual(detail["error"], "total_mismatch")
        self.assertIn("confirm_key", detail)
        self.assertEqual(detail["confirm_key"], "confirm_total_mismatch")
        self.assertEqual(self.client.payloads, [])

    # ── TEST F — mismatch with Save Anyway confirmation ───────────────────────

    def test_F_mismatch_with_confirmation_saves_with_review_required(self):
        """Same mismatch + confirm_total_mismatch=True → HTTP 201, review_required=True."""
        record = make_record(
            record_id="test-f",
            total_amount=9999.0,
            confirm_total_mismatch=True,
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        payload = self.client.payloads[0]
        self.assertEqual(payload["metadata"]["review_required"], True)
        # Warning preserved in review_hints
        hints = payload["metadata"]["review_hints"]
        self.assertTrue(any("reconcile" in h["message"] for h in hints))

    # ── TEST G — malformed payload ────────────────────────────────────────────

    def test_G_malformed_payload_is_rejected(self):
        """Missing required metadata → HTTP 422, no persist."""
        response = self.http.post(
            "/api/v1/financial-records",
            json={
                "record_id": "test-g",
                "document_type": "receipt",
                "items": [],
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.payloads, [])

    # ── TEST H — wallet flow unchanged ───────────────────────────────────────

    def test_H_wallet_screenshot_saves_successfully(self):
        """Existing wallet behavior must remain passing."""
        record = make_record(
            record_id="test-h",
            document_type="wallet_screenshot",
            source="wallet_analysis",
            merchant="Easypaisa",
            total_amount=1200.0,
            items=[
                UniversalFinancialRecordItem(
                    description="Money sent",
                    amount=1200.0,
                    category="wallet",
                    metadata={
                        "wallet_name": "Easypaisa",
                        "transaction_type": "debit",
                    },
                )
            ],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["document_type"], "wallet_screenshot")
        self.assertEqual(self.client.payloads[0]["source"], "wallet_analysis")
        self.assertEqual(self.client.payloads[0]["items"][0]["category"], "wallet")

    # ── Subtotal-based reconciliation (empty / partial items) ────────────────

    def test_empty_items_with_subtotal_mismatch_returns_total_mismatch(self):
        """No items, subtotal declared, total does not reconcile → HTTP 409 total_mismatch."""
        record = make_record(
            record_id="test-empty-mismatch",
            total_amount=9999.0,
            subtotal_amount=1000.0,
            items=[],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 409)
        detail = response.json()["detail"]
        self.assertEqual(detail["error"], "total_mismatch")
        self.assertEqual(self.client.payloads, [])

    def test_empty_items_with_subtotal_mismatch_confirmed_saves_with_review(self):
        """Same record + confirm_total_mismatch=True → HTTP 201, review_required=True."""
        record = make_record(
            record_id="test-empty-mismatch-confirmed",
            total_amount=9999.0,
            subtotal_amount=1000.0,
            confirm_total_mismatch=True,
            items=[],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        payload = self.client.payloads[0]
        self.assertEqual(payload["metadata"]["review_required"], True)
        hints = payload["metadata"]["review_hints"]
        self.assertTrue(any("reconcile" in h["message"] for h in hints))

    def test_partial_item_amounts_with_subtotal_mismatch_returns_total_mismatch(self):
        """Partial item amounts, subtotal declared, total does not reconcile → HTTP 409."""
        record = make_record(
            record_id="test-partial-mismatch",
            total_amount=9999.0,
            subtotal_amount=1000.0,
            items=[
                UniversalFinancialRecordItem(
                    description="Readable item", amount=600.0, category="food"
                ),
                UniversalFinancialRecordItem(
                    description="Unreadable item", amount=None, category="food"
                ),
            ],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["error"], "total_mismatch")
        self.assertEqual(self.client.payloads, [])

    def test_partial_item_amounts_with_subtotal_mismatch_confirmed_saves(self):
        """Same partial-item record + confirm=True → HTTP 201, review_required=True."""
        record = make_record(
            record_id="test-partial-mismatch-confirmed",
            total_amount=9999.0,
            subtotal_amount=1000.0,
            confirm_total_mismatch=True,
            items=[
                UniversalFinancialRecordItem(
                    description="Readable item", amount=600.0, category="food"
                ),
                UniversalFinancialRecordItem(
                    description="Unreadable item", amount=None, category="food"
                ),
            ],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.payloads[0]["metadata"]["review_required"], True)

    def test_subtotal_based_reconciliation_passes_when_totals_match(self):
        """subtotal + service_charge = total with partial items → HTTP 201 (no confirmation needed)."""
        record = make_record(
            record_id="test-subtotal-ok",
            total_amount=1150.0,
            subtotal_amount=1000.0,
            tax_amount=150.0,
            items=[
                UniversalFinancialRecordItem(
                    description="Readable item", amount=600.0, category="food"
                ),
                UniversalFinancialRecordItem(
                    description="Unreadable item", amount=None, category="food"
                ),
            ],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)

    # ── Existing passing tests preserved ─────────────────────────────────────

    def test_valid_receipt_ufr_saves_successfully(self):
        response = self.post_record(make_record())
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.json(),
            {
                "saved": True,
                "record_id": "record-1",
                "document_type": "receipt",
                "category": "groceries",
            },
        )
        self.assertEqual(self.client.payloads[0]["id"], "record-1")
        self.assertEqual(self.client.payloads[0]["source"], "receipt_analysis")
        self.assertEqual(self.client.payloads[0]["amount"], 450.5)
        self.assertEqual(len(self.client.payloads[0]["items"]), 2)

    def test_receipt_with_service_charge_saves_successfully(self):
        record = make_record(
            record_id="service-charge-1",
            total_amount=8415.0,
            service_charge=765.0,
            items=[
                UniversalFinancialRecordItem(
                    description="Chicken Karahi",
                    amount=5250.0,
                    quantity=1,
                    unit_price=5250.0,
                    category="restaurant",
                ),
                UniversalFinancialRecordItem(
                    description="Seekh Kebab",
                    amount=1400.0,
                    quantity=2,
                    unit_price=700.0,
                    category="restaurant",
                ),
                UniversalFinancialRecordItem(
                    description="Soft Drink",
                    amount=1000.0,
                    quantity=2,
                    unit_price=500.0,
                    category="restaurant",
                ),
            ],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["record_id"], "service-charge-1")
        self.assertEqual(self.client.payloads[0]["amount"], 8415.0)
        self.assertEqual(self.client.payloads[0]["metadata"]["service_charge"], 765.0)

    def test_valid_utility_bill_ufr_saves_successfully(self):
        record = make_record(
            record_id="utility-1",
            document_type="utility_bill",
            source="utility_bill_analysis",
            merchant="K-Electric",
            total_amount=2750.0,
            category="utilities",
            items=[
                UniversalFinancialRecordItem(
                    description="Electricity bill",
                    amount=2750.0,
                    category="utilities",
                    metadata={"consumer_number": "consumer-1"},
                )
            ],
        )
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["document_type"], "utility_bill")
        self.assertEqual(self.client.payloads[0]["merchant_provider"], "K-Electric")
        self.assertEqual(self.client.payloads[0]["category"], "utilities")

    def test_invalid_malformed_ufr_is_rejected(self):
        response = self.http.post(
            "/api/v1/financial-records",
            json={
                "record_id": "invalid-1",
                "document_type": "receipt",
                "items": [],
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.payloads, [])

    def test_duplicate_record_id_is_handled_safely(self):
        self.client.error = SupabaseConflictError(
            "Supabase rejected the insert because the record already exists."
        )
        response = self.post_record(make_record(record_id="duplicate-1"))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            {
                "error": "Financial record already exists",
                "record_id": "duplicate-1",
            },
        )

    def test_supabase_failure_produces_controlled_api_error(self):
        self.client.error = SupabaseConnectionError("simulated database failure")
        response = self.post_record(make_record(record_id="database-failure-1"))
        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json()["detail"],
            {"error": "Financial record persistence is unavailable."},
        )

    # ── Auto-categorisation ──────────────────────────────────────────────────

    def test_record_without_category_is_auto_categorised_on_save(self):
        record = make_record(record_id="auto-1", merchant="K-Electric", total_amount=450.5)
        record.category = None
        response = self.post_record(record)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["category"], "utilities")
        self.assertEqual(self.client.payloads[0]["category"], "utilities")
        self.assertEqual(self.client.payloads[0]["metadata"]["category_source"], "merchant")

    def test_user_chosen_category_is_kept(self):
        record = make_record(record_id="user-1", merchant="K-Electric", category="health")
        response = self.post_record(record)
        self.assertEqual(response.json()["category"], "health")
        self.assertEqual(self.client.payloads[0]["metadata"]["category_source"], "user")

    def test_list_backfills_category_for_older_records(self):
        self.client.records = [
            {"id": "old-1", "document_type": "receipt", "merchant_provider": "Cheezious",
             "transaction_date": "2026-08-01", "amount": 900.0, "currency": "PKR", "category": None}
        ]
        body = self.http.get("/api/v1/financial-records").json()
        self.assertEqual(body["records"][0]["category"], "restaurant")

    # ── GET /api/v1/financial-records ────────────────────────────────────────

    def test_list_returns_saved_records_shaped_for_mobile(self):
        self.client.records = [
            {
                "id": "record-1",
                "document_type": "receipt",
                "merchant_provider": "Karachi Grocers",
                "transaction_date": "2026-08-12",
                "amount": 450.5,
                "currency": "PKR",
                "category": "groceries",
            }
        ]
        response = self.http.get("/api/v1/financial-records")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "records": [
                    {
                        "id": "record-1",
                        "document_type": "receipt",
                        "merchant": "Karachi Grocers",
                        "transaction_date": "2026-08-12",
                        "amount": 450.5,
                        "currency": "PKR",
                        "category": "groceries",
                    }
                ]
            },
        )

    def test_list_returns_empty_list_when_nothing_saved(self):
        response = self.http.get("/api/v1/financial-records")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"records": []})

    def test_list_returns_503_when_storage_is_unavailable(self):
        self.client.error = SupabaseConnectionError("simulated database failure")
        response = self.http.get("/api/v1/financial-records")
        self.assertEqual(response.status_code, 503)


class SupabaseInsertTests(unittest.TestCase):
    def test_supabase_client_maps_http_409_to_conflict(self):
        import httpx

        http_client = httpx.Client(
            base_url="https://example.supabase.co",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(409, json={"code": "23505"})
            ),
        )
        client = SupabaseClient(
            url="https://example.supabase.co",
            service_role_key="server-key",
            http_client=http_client,
        )

        with self.assertRaises(SupabaseConflictError):
            client.insert_financial_record({"id": "duplicate-1"})

        client.close()


if __name__ == "__main__":
    unittest.main()
