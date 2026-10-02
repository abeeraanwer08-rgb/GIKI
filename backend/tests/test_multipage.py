from __future__ import annotations

import asyncio
import io
import unittest

import cv2
import numpy as np
import pymupdf
from fastapi.testclient import TestClient

from main import app
from parsers.bank_statement_parser import BankStatementParser
from routes import receipt as receipt_routes
from routes.auth import get_current_user
from schemas.bank_statement import BankStatementAnalysisResponse, BankTransaction
from schemas.review_response import ReviewResponse
from services.pdf_pages import MAX_PAGES, PdfError, is_pdf, render_pdf_pages
from services.pipeline import FinancialPipeline
from services.pipeline.pipeline_result import PipelineResult
from services.tokens import TokenUser

META = {"filename": "s.pdf", "content_type": "image/png", "size_bytes": 100}


def make_pdf(pages: int = 2, *, password: str | None = None) -> bytes:
    document = pymupdf.open()
    for number in range(pages):
        page = document.new_page()  # A4
        for row in range(45):
            page.insert_text((40, 60 + row * 16), f"Page {number + 1} row {row} Imtiaz Super Market 1,234.00 56,789.50", fontsize=9)
    if password:
        return document.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw=password, owner_pw=password)
    return document.tobytes()


def txn(date, desc, debit=None, credit=None, balance=None) -> BankTransaction:
    return BankTransaction(date=date, description=desc, debit=debit, credit=credit, balance=balance)


def page(txns, **overrides) -> BankStatementAnalysisResponse:
    fields = dict(**META, status="analysed", message="ok", bank_name="HBL", currency="PKR", transactions=txns)
    fields.update(overrides)
    return BankStatementAnalysisResponse(**fields)


class PdfRenderingTests(unittest.TestCase):
    def test_every_page_is_rendered_as_a_sharp_image(self):
        images = render_pdf_pages(make_pdf(3))
        self.assertEqual(len(images), 3)
        for png in images:
            decoded = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)
            self.assertGreaterEqual(min(decoded.shape[:2]), 1000)

    def test_unusable_pdfs_give_user_safe_errors(self):
        cases = {
            "damaged": (b"%PDF-1.7 this is not really a pdf", "could not be opened"),
            "password": (make_pdf(1, password="secret"), "password-protected"),
            "too many": (make_pdf(MAX_PAGES + 1), "limit is 12"),
        }
        for label, (data, expected) in cases.items():
            with self.subTest(label):
                with self.assertRaises(PdfError) as caught:
                    render_pdf_pages(data)
                self.assertIn(expected, str(caught.exception))

    def test_pdf_detection_uses_the_bytes(self):
        self.assertTrue(is_pdf(make_pdf(1)))
        self.assertFalse(is_pdf(b"\x89PNG"))


class StatementMergeTests(unittest.TestCase):
    merge = staticmethod(BankStatementParser.merge_pages)

    def test_rows_concatenate_and_header_fields_come_from_the_right_pages(self):
        first = page([txn("2026-09-01", "A", debit=10, balance=90)], opening_balance=100.0, period_start="2026-09-01", period_end="2026-09-15", account_last4="4321")
        second = page([txn("2026-09-20", "B", credit=5, balance=95)], bank_name=None, closing_balance=95.0, period_end="2026-09-30", stated_total_debits=10.0, stated_total_credits=5.0)
        merged = self.merge([first, second])
        self.assertEqual([t.description for t in merged.transactions], ["A", "B"])
        self.assertEqual((merged.bank_name, merged.account_last4, merged.opening_balance, merged.closing_balance), ("HBL", "4321", 100.0, 95.0))
        self.assertEqual((merged.period_start, merged.period_end), ("2026-09-01", "2026-09-30"))
        self.assertEqual((merged.stated_total_debits, merged.stated_total_credits), (10.0, 5.0))
        self.assertEqual(BankStatementParser().validate(merged).warnings, [])

    def test_a_row_repeated_at_the_top_of_the_next_page_is_dropped(self):
        row = dict(date="2026-09-05", desc="Careem", debit=500.0, balance=1000.0)
        merged = self.merge([page([txn("2026-09-01", "A", debit=1, balance=1500), txn(**row)]), page([txn(**row), txn("2026-09-06", "C", debit=2, balance=998)])])
        self.assertEqual([t.description for t in merged.transactions], ["A", "Careem", "C"])

    def test_identical_rows_with_different_balances_are_both_kept(self):
        merged = self.merge([page([txn("2026-09-05", "Careem", debit=500.0, balance=1000.0)]), page([txn("2026-09-05", "Careem", debit=500.0, balance=500.0)])])
        self.assertEqual(len(merged.transactions), 2)

    def test_printed_page_subtotals_are_summed_but_a_single_total_is_kept(self):
        per_page = self.merge([page([], stated_total_debits=100.0), page([], stated_total_debits=50.0)])
        self.assertEqual(per_page.stated_total_debits, 150.0)
        single = self.merge([page([]), page([], stated_total_debits=150.0)])
        self.assertEqual(single.stated_total_debits, 150.0)

    def test_undated_first_rows_of_a_later_page_inherit_across_the_page_break(self):
        merged = self.merge([page([txn("2026-09-05", "A", debit=1)]), page([txn(None, "B", debit=2)])])
        self.assertEqual((merged.transactions[1].date, merged.transactions[1].date_inferred), ("2026-09-05", True))

    def test_a_failed_page_fails_the_merge_and_one_page_passes_through(self):
        bad = page([], status="error", message="boom")
        self.assertEqual(self.merge([page([]), bad]).status, "error")
        only = page([txn("2026-09-01", "A", debit=1)])
        self.assertIs(self.merge([only]), only)


class PagesParser(BankStatementParser):
    """Returns a different canned page on each call, like a real two-page statement."""

    def __init__(self) -> None:
        self.calls = 0

    async def process_bytes(self, image_bytes, filename, content_type):
        self.calls += 1
        if self.calls == 1:
            return page([txn("2026-09-01", "Imtiaz Super Market", debit=500.0, balance=9500.0)], opening_balance=10000.0, period_start="2026-09-01", period_end="2026-09-30")
        return page([txn("2026-09-20", "Cafe Flo", debit=250.0, balance=9250.0)], closing_balance=9250.0, stated_total_debits=750.0)


class ProcessPagesTests(unittest.TestCase):
    def run_pages(self, pages, hint="bank_statement"):
        pipeline = FinancialPipeline(bank_statement_parser=PagesParser())
        return asyncio.run(pipeline.process_pages(pages, "stmt.pdf", hint))

    def test_a_real_two_page_pdf_flows_through_quality_merge_and_review(self):
        pages = [(png, "image/png") for png in render_pdf_pages(make_pdf(2))]
        result = self.run_pages(pages)
        self.assertTrue(result.success, result.errors)
        review = result.payload
        self.assertEqual(review.document_type, "bank_statement")
        self.assertEqual([i.description for i in review.extracted_items], ["Imtiaz Super Market", "Cafe Flo"])
        self.assertEqual(review.editable_fields["total_amount"].value, 750.0)
        self.assertEqual(review.validation_warnings, [])
        self.assertEqual(review.processing_metadata["details"]["closing_balance"], 9250.0)

    def test_a_bad_page_is_rejected_by_number(self):
        good = render_pdf_pages(make_pdf(1))[0]
        dark = cv2.imencode(".png", np.zeros((1600, 1200, 3), np.uint8))[1].tobytes()
        result = self.run_pages([(good, "image/png"), (dark, "image/png")])
        self.assertFalse(result.success)
        self.assertEqual(result.http_status_code, 400)
        self.assertTrue(result.errors[0].startswith("Page 2:"))
        self.assertEqual(result.payload["page"], 2)

    def test_types_that_cannot_span_pages_are_refused_with_guidance(self):
        pages = [(png, "image/png") for png in render_pdf_pages(make_pdf(2))]
        result = self.run_pages(pages, hint="receipt")
        self.assertFalse(result.success)
        self.assertEqual((result.http_status_code, result.payload["error"]), (422, "multi_page_unsupported"))


class RecordingPipeline:
    def __init__(self) -> None:
        self.single, self.multi = [], []

    def _ok(self):
        return PipelineResult.ok("fake", ReviewResponse(status="success", document_type="bank_statement", editable_fields={}, extracted_items=[], review_hints=[], overall_confidence=0.9, processing_metadata={}))

    async def process(self, context):
        self.single.append(context)
        return self._ok()

    async def process_pages(self, pages, filename, hint):
        self.multi.append((pages, filename, hint))
        return self._ok()


class UploadRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pipeline = RecordingPipeline()
        self._original = receipt_routes._financial_pipeline
        receipt_routes._financial_pipeline = self.pipeline
        app.dependency_overrides[get_current_user] = lambda: TokenUser("u", "a@b.co", "A")
        self.http = TestClient(app)

    def tearDown(self) -> None:
        receipt_routes._financial_pipeline = self._original
        self.http.close()
        app.dependency_overrides.clear()

    def post(self, files, **data):
        return self.http.post("/api/v1/receipt/upload", files=files, data=data)

    def test_a_multi_page_pdf_is_rendered_and_sent_as_pages(self):
        response = self.post([("file", ("stmt.pdf", make_pdf(3), "application/pdf"))], document_type="bank_statement")
        self.assertEqual(response.status_code, 200)
        pages, filename, hint = self.pipeline.multi[0]
        self.assertEqual((len(pages), filename, hint), (3, "stmt.pdf", "bank_statement"))
        self.assertTrue(all(content_type == "image/png" for _, content_type in pages))
        self.assertEqual(self.pipeline.single, [])

    def test_a_single_page_pdf_takes_the_ordinary_path(self):
        self.assertEqual(self.post([("file", ("one.pdf", make_pdf(1), "application/pdf"))]).status_code, 200)
        self.assertEqual((len(self.pipeline.single), len(self.pipeline.multi)), (1, 0))
        self.assertEqual(self.pipeline.single[0].content_type, "image/png")

    def test_several_photos_are_pages_in_upload_order(self):
        png = cv2.imencode(".png", np.full((50, 50, 3), 9, np.uint8))[1].tobytes()
        jpg = cv2.imencode(".jpg", np.full((50, 50, 3), 9, np.uint8))[1].tobytes()
        files = [("file", ("a.png", png, "image/png")), ("file", ("b.jpg", jpg, "image/jpeg"))]
        self.assertEqual(self.post(files, document_type="invoice").status_code, 200)
        pages, _, hint = self.pipeline.multi[0]
        self.assertEqual(([c for _, c in pages], hint), (["image/png", "image/jpeg"], "invoice"))

    def test_bad_inputs_are_refused_before_any_processing(self):
        cases = [
            ("damaged pdf", [("file", ("x.pdf", b"%PDF-1.4 junk", "application/pdf"))], 422),
            ("pdf label on non-pdf bytes", [("file", ("x.pdf", b"hello", "application/pdf"))], 422),
            ("password pdf", [("file", ("x.pdf", make_pdf(1, password="s"), "application/pdf"))], 422),
            ("too many pages", [("file", ("x.pdf", make_pdf(MAX_PAGES + 1), "application/pdf"))], 422),
            ("too many files", [("file", (f"{i}.png", b"x", "image/png")) for i in range(MAX_PAGES + 1)], 422),
            ("text file", [("file", ("x.txt", b"hello", "text/plain"))], 415),
        ]
        for label, files, expected in cases:
            with self.subTest(label):
                self.assertEqual(self.post(files).status_code, expected)
        self.assertEqual((self.pipeline.single, self.pipeline.multi), ([], []))

    def test_total_size_across_files_is_capped(self):
        big = b"\x00" * (9 * 1024 * 1024)
        files = [("file", (f"{i}.png", big, "image/png")) for i in range(3)]
        self.assertEqual(self.post(files).status_code, 413)


if __name__ == "__main__":
    unittest.main()
