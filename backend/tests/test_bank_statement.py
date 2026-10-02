from __future__ import annotations

import io
import unittest
from typing import Any

import cv2
import httpx
import numpy as np
from fastapi.testclient import TestClient

from main import app
from parsers.bank_statement_parser import BankStatementParser, mask_account_number
from routes import receipt as receipt_routes
from routes.auth import get_current_user
from routes.financial_records import (
    get_financial_record_persistence_service,
    get_supabase_dependency,
)
from schemas.review_response import ReviewResponse
from schemas.bank_statement import BankStatementAnalysisResponse, BankTransaction
from services.document_classifier import DocumentClassifierService
from services.financial_record_persistence import FinancialRecordPersistenceService
from services.pipeline.pipeline_context import PipelineContext
from services.pipeline.stages.classifier_stage import ClassifierStage
from services.supabase_client import SupabaseClient
from services.tokens import TokenUser
from services.ufr_mapper import UniversalFinancialRecordMapper

META = {"filename": "stmt.png", "content_type": "image/png", "size_bytes": 10}


def statement(**overrides: Any) -> BankStatementAnalysisResponse:
    """A statement whose numbers all agree with each other."""
    fields: dict[str, Any] = dict(
        **META,
        status="analysed",
        message="ok",
        bank_name="HBL",
        account_last4="4321",
        currency="PKR",
        period_start="2026-09-01",
        period_end="2026-09-30",
        opening_balance=50000.0,
        closing_balance=50000.0 + 20000.0 - 3450.0 - 1850.0,
        stated_total_debits=5300.0,
        stated_total_credits=20000.0,
        transactions=[
            BankTransaction(date="2026-09-02", description="Salary", credit=20000.0, balance=70000.0),
            BankTransaction(date="2026-09-05", description="Imtiaz Super Market", debit=3450.0, balance=66550.0),
            BankTransaction(date="2026-09-09", description="Cafe Flo", debit=1850.0, balance=64700.0),
        ],
    )
    fields.update(overrides)
    return BankStatementAnalysisResponse(**fields)


class ParserCoercionTests(unittest.TestCase):
    parser = BankStatementParser()

    def build(self, data: Any) -> BankStatementAnalysisResponse:
        return self.parser._build_response(META, data)

    def test_messy_model_output_is_cleaned(self):
        result = self.build(
            {
                "bank_name": " HBL ",
                "account_number": "PK36 SCBL 0000 0011 2345 6702",
                "currency": "PKR",
                "period_start": "2026-09-01",
                "period_end": "31/09/2026",  # not ISO -> unreadable, not guessed
                "opening_balance": "1,000.50",
                "transactions": [
                    {"date": "2026-09-03", "description": "Careem", "debit": "Rs. 1,250.00", "credit": 0},
                    {"date": "bad", "description": "ATM", "debit": None, "credit": "300"},
                    "not-an-object",
                ],
            }
        )
        self.assertEqual(result.bank_name, "HBL")
        self.assertEqual(result.account_last4, "6702")
        self.assertIsNone(result.period_end)
        self.assertEqual(result.opening_balance, 1000.5)
        self.assertEqual(len(result.transactions), 2)
        first, second = result.transactions
        self.assertEqual((first.debit, first.credit), (1250.0, None))
        # An unreadable date inherits the previous row's date, flagged for the user to check.
        self.assertEqual((second.date, second.date_inferred, second.credit), ("2026-09-03", True, 300.0))

    def test_non_object_response_gives_an_empty_statement(self):
        self.assertEqual(self.build(["nope"]).transactions, [])

    def test_runaway_responses_are_capped(self):
        rows = [{"description": f"row {i}", "debit": 1} for i in range(1000)]
        self.assertEqual(len(self.build({"transactions": rows}).transactions), 300)

    def test_full_account_number_is_never_kept(self):
        self.assertEqual(mask_account_number("1234567890123"), "0123")
        self.assertIsNone(mask_account_number("12"))
        self.assertIsNone(mask_account_number(None))
        dumped = self.build({"account_number": "1234567890123"}).model_dump_json()
        self.assertNotIn("1234567890123", dumped)


class ValidationTests(unittest.TestCase):
    parser = BankStatementParser()

    def test_consistent_statement_has_no_warnings(self):
        report = self.parser.validate(statement())
        self.assertTrue(report.valid)
        self.assertEqual(report.warnings, [])
        self.assertEqual((report.calculated_total, report.difference), (5300.0, 0.0))

    def test_printed_debit_total_mismatch_is_flagged(self):
        report = self.parser.validate(statement(stated_total_debits=6000.0))
        self.assertTrue(any("debits" in w and "missing or misread" in w for w in report.warnings))
        self.assertEqual(report.difference, -700.0)

    def test_balance_equation_and_running_balance_are_checked(self):
        bad_close = self.parser.validate(statement(closing_balance=1.0))
        self.assertTrue(any("closing balance" in w for w in bad_close.warnings))

        txns = statement().transactions
        txns[2] = txns[2].model_copy(update={"balance": 99999.0})
        broken = self.parser.validate(statement(transactions=txns))
        self.assertEqual(sum("Running balance breaks" in w for w in broken.warnings), 1)

    def test_negative_amounts_are_hard_errors(self):
        txns = [BankTransaction(description="x", debit=-5.0)]
        report = self.parser.validate(statement(transactions=txns, stated_total_debits=None))
        self.assertFalse(report.valid)

    def test_empty_statement_warns(self):
        report = self.parser.validate(statement(transactions=[]))
        self.assertIn("No transactions were found on this page.", report.warnings)

    def test_missing_header_fields_are_warnings(self):
        report = self.parser.validate(statement(bank_name=None, period_start=None))
        self.assertIn("Statement field is missing: bank_name.", report.warnings)
        self.assertTrue(report.valid)


class PageQualityTests(unittest.TestCase):
    """A white A4 page must not be rejected as 'overexposed' like a glary receipt."""

    @staticmethod
    def page(brightness: int, rows: int = 60) -> bytes:
        image = np.full((1400, 1100, 3), brightness, dtype=np.uint8)
        rng = np.random.default_rng(0)
        for row in range(rows):
            cv2.putText(
                image, f"Row {row} {rng.integers(1000, 9999)}.00", (30, 40 + row * 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (10, 10, 10), 1, cv2.LINE_AA,
            )
        return cv2.imencode(".png", image)[1].tobytes()

    def test_bright_page_passes_for_a_statement_but_not_a_receipt(self):
        from services.image_quality import ImageQualityService

        service, image = ImageQualityService(), self.page(247)
        self.assertTrue(service.validate_image(image, "bank_statement").passed)
        self.assertFalse(service.validate_image(image).passed)
        self.assertFalse(service.validate_image(image, "receipt").passed)

    def test_a_blown_out_page_still_fails(self):
        from services.image_quality import ImageQualityService

        self.assertFalse(ImageQualityService().validate_image(self.page(255, rows=2), "bank_statement").passed)


class MapperTests(unittest.TestCase):
    def test_debits_become_categorised_items_and_credits_become_details(self):
        record = UniversalFinancialRecordMapper().from_bank_statement_analysis(statement())
        self.assertEqual(record.document_type, "bank_statement")
        self.assertEqual((record.merchant, record.document_date, record.total_amount), ("HBL", "2026-09-30", 5300.0))
        self.assertEqual(
            [(i.description, i.amount, i.category) for i in record.items],
            [("Imtiaz Super Market", 3450.0, "groceries"), ("Cafe Flo", 1850.0, "restaurant")],
        )
        self.assertEqual(record.items[0].metadata["date"], "2026-09-05")
        details = record.metadata.details
        self.assertEqual((details["credit_count"], details["total_credits"]), (1, 20000.0))
        self.assertEqual(details["account_last4"], "4321")

    def test_statement_with_no_debits_has_no_total(self):
        credits_only = statement(transactions=[BankTransaction(description="Salary", credit=1.0)])
        record = UniversalFinancialRecordMapper().from_bank_statement_analysis(credits_only)
        self.assertEqual((record.items, record.total_amount), ([], None))

    def test_legacy_projection_matches_the_upload_response_shape(self):
        legacy = BankStatementParser().to_legacy_receipt_response(statement())
        self.assertEqual((legacy.merchant_name, legacy.total_amount, len(legacy.items or [])), ("HBL", 5300.0, 2))


class ClassifierHintTests(unittest.TestCase):
    def test_user_chosen_type_skips_the_heuristic_classifier(self):
        image = np.full((200, 200, 3), 255, dtype=np.uint8)
        _, png = cv2.imencode(".png", image)
        context = PipelineContext(png.tobytes(), "a.png", "image/png", document_type_hint="bank_statement")
        result = ClassifierStage(DocumentClassifierService()).process(context)
        self.assertTrue(result.success)
        self.assertEqual((context.document_type, context.classification.confidence), ("bank_statement", "high"))


class FakePipeline:
    def __init__(self) -> None:
        self.contexts: list[PipelineContext] = []

    async def process(self, context: PipelineContext):
        from services.pipeline.pipeline_result import PipelineResult

        self.contexts.append(context)
        return PipelineResult.ok(
            "fake",
            ReviewResponse(
                status="success",
                document_type="receipt",
                editable_fields={},
                extracted_items=[],
                review_hints=[],
                overall_confidence=0.9,
                processing_metadata={},
            ),
        )


class UploadHintTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pipeline = FakePipeline()
        self._original = receipt_routes._financial_pipeline
        receipt_routes._financial_pipeline = self.pipeline
        app.dependency_overrides[get_current_user] = lambda: TokenUser("u", "a@b.co", "A")
        self.http = TestClient(app)

    def tearDown(self) -> None:
        receipt_routes._financial_pipeline = self._original
        self.http.close()
        app.dependency_overrides.clear()

    def upload(self, **data: str):
        return self.http.post(
            "/api/v1/receipt/upload",
            files={"file": ("a.png", io.BytesIO(b"x"), "image/png")},
            data=data,
        )

    def test_hint_is_passed_through_and_normalised(self):
        self.assertEqual(self.upload(document_type=" Bank_Statement ").status_code, 200)
        self.assertEqual(self.pipeline.contexts[-1].document_type_hint, "bank_statement")

    def test_auto_or_missing_hint_uses_the_classifier(self):
        self.upload()
        self.upload(document_type="auto")
        self.assertEqual([c.document_type_hint for c in self.pipeline.contexts], [None, None])

    def test_unknown_hint_is_rejected_before_any_processing(self):
        response = self.upload(document_type="passport")
        self.assertEqual(response.status_code, 422)
        self.assertIn("bank_statement", response.json()["detail"]["allowed"])
        self.assertEqual(self.pipeline.contexts, [])


class FakeStatementStore:
    def __init__(self) -> None:
        self.rows: dict[str, dict[str, Any]] = {}
        self.single: list[dict[str, Any]] = []

    def insert_financial_record(self, payload: dict[str, Any]) -> None:
        self.single.append(payload)

    def insert_financial_records(self, payloads, *, ignore_duplicates: bool = False) -> int:
        fresh = [p for p in payloads if p["id"] not in self.rows]
        for payload in fresh:
            self.rows[payload["id"]] = payload
        return len(fresh)


class SaveStatementTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = FakeStatementStore()
        service = FinancialRecordPersistenceService(client=self.store)  # type: ignore[arg-type]
        app.dependency_overrides[get_financial_record_persistence_service] = lambda: service
        app.dependency_overrides[get_supabase_dependency] = lambda: self.store
        app.dependency_overrides[get_current_user] = lambda: TokenUser("user-1", "a@b.co", "A")
        self.http = TestClient(app)

    def tearDown(self) -> None:
        self.http.close()
        app.dependency_overrides.clear()

    def post(self, analysis: BankStatementAnalysisResponse | None = None):
        record = UniversalFinancialRecordMapper().from_bank_statement_analysis(analysis or statement())
        return self.http.post("/api/v1/financial-records", json=record.model_dump(mode="json"))

    def test_each_spending_row_is_stored_as_its_own_record(self):
        response = self.post()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["records_saved"], 2)
        rows = sorted(self.store.rows.values(), key=lambda r: r["transaction_date"])
        self.assertEqual(
            [(r["merchant_provider"], r["amount"], r["category"], r["transaction_date"]) for r in rows],
            [("Imtiaz Super Market", 3450.0, "groceries", "2026-09-05"), ("Cafe Flo", 1850.0, "restaurant", "2026-09-09")],
        )
        self.assertTrue(all(r["user_id"] == "user-1" and r["document_type"] == "bank_statement" for r in rows))
        self.assertEqual(self.store.single, [])
        self.assertNotIn("account_number", str(rows))

    def test_saving_the_same_statement_again_is_a_conflict_not_a_duplicate(self):
        self.assertEqual(self.post().status_code, 201)
        again = self.post()  # new record_id, same content
        self.assertEqual(again.status_code, 409)
        self.assertEqual(len(self.store.rows), 2)

    def test_overlapping_statement_only_adds_the_new_rows(self):
        self.post()
        txns = statement().transactions + [
            BankTransaction(date="2026-09-12", description="Careem", debit=500.0, balance=64200.0)
        ]
        response = self.post(statement(transactions=txns, stated_total_debits=5800.0))
        self.assertEqual((response.status_code, response.json()["records_saved"]), (201, 1))
        self.assertEqual(len(self.store.rows), 3)

    def test_identical_same_day_rows_are_two_transactions(self):
        twin = BankTransaction(date="2026-09-05", description="Careem", debit=500.0)
        analysis = statement(transactions=[twin, twin], stated_total_debits=None, stated_total_credits=None)
        self.assertEqual(self.post(analysis).json()["records_saved"], 2)

    def test_users_never_collide_on_row_ids(self):
        self.post()
        app.dependency_overrides[get_current_user] = lambda: TokenUser("user-2", "c@d.co", "C")
        self.assertEqual(self.post().status_code, 201)
        self.assertEqual(len(self.store.rows), 4)

    def test_statement_without_spending_is_rejected(self):
        credits_only = statement(transactions=[BankTransaction(description="Salary", credit=9.0)])
        self.assertEqual(self.post(credits_only).status_code, 422)
        self.assertEqual(self.store.rows, {})

    def test_a_row_with_a_malformed_date_is_rejected_but_a_fixed_one_saves(self):
        record = UniversalFinancialRecordMapper().from_bank_statement_analysis(statement())
        payload = record.model_dump(mode="json")
        payload["items"][0]["metadata"]["date"] = "5th Sept"
        response = self.http.post("/api/v1/financial-records", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertIn("Transaction 1 has an invalid date", response.json()["detail"]["errors"][0])
        self.assertEqual(self.store.rows, {})
        payload["items"][0]["metadata"]["date"] = "2026-09-05"
        self.assertEqual(self.http.post("/api/v1/financial-records", json=payload).status_code, 201)

    def test_a_row_without_a_date_is_filed_on_the_statement_end_date(self):
        record = UniversalFinancialRecordMapper().from_bank_statement_analysis(statement())
        payload = record.model_dump(mode="json")
        payload["items"][0]["metadata"]["date"] = None
        self.assertEqual(self.http.post("/api/v1/financial-records", json=payload).status_code, 201)
        dates = {r["merchant_provider"]: r["transaction_date"] for r in self.store.rows.values()}
        self.assertEqual(dates["Imtiaz Super Market"], "2026-09-30")

    def test_user_edited_category_is_kept(self):
        record = UniversalFinancialRecordMapper().from_bank_statement_analysis(statement())
        payload = record.model_dump(mode="json")
        payload["items"][0]["category"] = "Shopping"
        self.assertEqual(self.http.post("/api/v1/financial-records", json=payload).status_code, 201)
        categories = {r["merchant_provider"]: r["category"] for r in self.store.rows.values()}
        self.assertEqual(categories["Imtiaz Super Market"], "shopping")


class SupabaseBatchInsertTests(unittest.TestCase):
    def test_ignore_duplicates_sends_prefer_header_and_counts_inserted_rows(self):
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(201, json=[{"id": "a"}])  # only one of two was new

        client = SupabaseClient(
            url="https://example.supabase.co",
            service_role_key="k",
            http_client=httpx.Client(base_url="https://example.supabase.co", transport=httpx.MockTransport(handler)),
        )
        count = client.insert_financial_records([{"id": "a"}, {"id": "b"}], ignore_duplicates=True)
        self.assertEqual(count, 1)
        self.assertEqual(seen[0].url.params["on_conflict"], "id")
        self.assertEqual(seen[0].headers["prefer"], "resolution=ignore-duplicates,return=representation")


if __name__ == "__main__":
    unittest.main()
