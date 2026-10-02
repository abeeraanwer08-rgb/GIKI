from __future__ import annotations

import asyncio
import io
import unittest
from pathlib import Path

import cv2
import numpy as np
from fastapi.testclient import TestClient

from main import app
from parsers.invoice_parser import InvoiceParser
from routes.auth import get_current_user
from routes.financial_records import get_financial_record_persistence_service, get_supabase_dependency
from schemas.invoice import InvoiceAnalysisResponse, InvoiceLine
from services.financial_record_persistence import FinancialRecordPersistenceService
from services.pipeline import FinancialPipeline, PipelineContext
from services.tokens import TokenUser
from services.ufr_mapper import UniversalFinancialRecordMapper

META = {"filename": "inv.png", "content_type": "image/png", "size_bytes": 10}


def invoice(**overrides) -> InvoiceAnalysisResponse:
    """An invoice whose numbers all agree: 2×500 + 1×250 = 1250; +GST 225 + shipping 100 − discount 75 = 1500."""
    fields = dict(
        **META, status="analysed", message="ok",
        vendor_name="Alpha Traders", vendor_tax_id="1234567-8", invoice_number="INV-0042",
        invoice_date="2026-09-10", due_date="2026-10-10", payment_terms="Net 30", currency="PKR",
        lines=[
            InvoiceLine(description="Office chairs", quantity=2, unit_price=500.0, amount=1000.0),
            InvoiceLine(description="Desk lamp", quantity=1, unit_price=250.0, amount=250.0),
        ],
        subtotal_amount=1250.0, tax_amount=225.0, discount_amount=75.0, shipping_amount=100.0, total_amount=1500.0,
    )
    fields.update(overrides)
    return InvoiceAnalysisResponse(**fields)


class InvoiceCoercionTests(unittest.TestCase):
    parser = InvoiceParser()

    def test_printed_text_is_cleaned_and_zero_tax_is_kept(self):
        result = self.parser._build_response(META, {
            "vendor_name": " Alpha ", "invoice_number": 42, "invoice_date": "10 Sep 2026", "due_date": "garbage",
            "lines": [
                {"description": "Chair", "quantity": "2", "unit_price": "Rs. 1,500.00", "amount": "3,000"},
                {"description": "", "quantity": None, "unit_price": None, "amount": None},
                "junk",
            ],
            "subtotal": "3,000", "tax": 0, "total": 3000,
        })
        self.assertEqual((result.vendor_name, result.invoice_number), ("Alpha", "42"))
        self.assertEqual((result.invoice_date, result.due_date), ("2026-09-10", None))
        self.assertEqual(len(result.lines), 1)
        self.assertEqual((result.lines[0].unit_price, result.lines[0].amount), (1500.0, 3000.0))
        self.assertEqual((result.subtotal_amount, result.tax_amount, result.total_amount), (3000.0, 0.0, 3000.0))

    def test_non_object_gives_an_empty_invoice(self):
        self.assertEqual(self.parser._build_response(META, None).lines, [])


class InvoiceValidationTests(unittest.TestCase):
    parser = InvoiceParser()

    def test_consistent_invoice_has_no_warnings(self):
        report = self.parser.validate(invoice())
        self.assertTrue(report.valid)
        self.assertEqual(report.warnings, [])
        self.assertEqual((report.calculated_total, report.difference, report.subtotal_difference), (1250.0, 0.0, 0.0))

    def test_line_maths_subtotal_and_total_are_each_checked(self):
        bad_line = invoice(lines=[InvoiceLine(description="Chair", quantity=2, unit_price=500.0, amount=900.0)] + invoice().lines[1:])
        self.assertTrue(any("Line 1: 2 × 500.00 is 1,000.00" in w for w in self.parser.validate(bad_line).warnings))

        bad_sub = self.parser.validate(invoice(subtotal_amount=2000.0)).warnings
        self.assertTrue(any("Line items add up to 1,250.00 but the subtotal is 2,000.00" in w for w in bad_sub))

        bad_total = self.parser.validate(invoice(total_amount=1400.0)).warnings
        self.assertTrue(any("is 1,500.00 but the total is 1,400.00" in w for w in bad_total))

    def test_missing_fields_dates_and_negative_amounts(self):
        report = self.parser.validate(invoice(invoice_number=None, vendor_name=None, due_date="2026-08-01", tax_amount=-5.0))
        self.assertFalse(report.valid)
        self.assertIn("Invoice field is missing: invoice number.", report.warnings)
        self.assertIn("The due date is before the invoice date.", report.warnings)
        self.assertIn("Invoice tax cannot be negative.", report.errors)

    def test_no_lines_warns_and_skips_the_total_check(self):
        report = self.parser.validate(invoice(lines=[], subtotal_amount=None))
        self.assertIn("No line items were found on this invoice.", report.warnings)
        self.assertIsNone(report.difference)


class InvoiceMergeTests(unittest.TestCase):
    def test_pages_concatenate_lines_and_take_totals_from_the_last_page(self):
        first = invoice(lines=invoice().lines[:1], subtotal_amount=None, tax_amount=None, discount_amount=None, shipping_amount=None, total_amount=None, due_date=None)
        second = invoice(lines=invoice().lines[1:], vendor_name=None, invoice_number=None, invoice_date=None)
        merged = InvoiceParser.merge_pages([first, second])
        self.assertEqual([l.description for l in merged.lines], ["Office chairs", "Desk lamp"])
        self.assertEqual((merged.vendor_name, merged.invoice_number), ("Alpha Traders", "INV-0042"))
        self.assertEqual((merged.subtotal_amount, merged.total_amount, merged.due_date), (1250.0, 1500.0, "2026-10-10"))
        self.assertEqual(InvoiceParser().validate(merged).warnings, [])

    def test_a_failed_page_fails_the_merge(self):
        failed = invoice(status="error", message="boom")
        self.assertEqual(InvoiceParser.merge_pages([invoice(), failed]).status, "error")


class InvoicePipelineAndSaveTests(unittest.TestCase):
    def test_pipeline_produces_a_review_with_invoice_fields_and_hints(self):
        class Fake(InvoiceParser):
            async def process_bytes(self, b, f, c):
                return invoice(invoice_number=None)

        image = np.full((1600, 1200, 3), 245, np.uint8)
        for i in range(40):
            cv2.putText(image, f"Line {i} 1,234.00", (40, 60 + i * 34), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (20, 20, 20), 1)
        png = cv2.imencode(".png", image)[1].tobytes()
        ctx = PipelineContext(png, "inv.png", "image/png", document_type_hint="invoice")
        result = asyncio.run(FinancialPipeline(invoice_parser=Fake()).process(ctx))
        self.assertTrue(result.success, getattr(result, "errors", None))
        review = result.payload
        self.assertEqual(review.document_type, "invoice")
        self.assertEqual(review.editable_fields["due_date"].value, "2026-10-10")
        self.assertEqual(review.processing_metadata["tax_amount"], 225.0)
        self.assertIn("Invoice number could not be identified.", [h.message for h in review.review_hints])
        self.assertEqual(len(review.extracted_items), 2)

    def test_mapper_and_save_round_trip(self):
        record = UniversalFinancialRecordMapper().from_invoice_analysis(invoice())
        self.assertEqual((record.document_type, record.merchant, record.total_amount), ("invoice", "Alpha Traders", 1500.0))
        self.assertEqual((record.metadata.subtotal_amount, record.metadata.tax_amount, record.metadata.delivery_charge, record.metadata.discount_amount), (1250.0, 225.0, 100.0, 75.0))
        self.assertEqual(record.metadata.details["invoice_number"], "INV-0042")

        class Store:
            def __init__(self): self.rows = []
            def insert_financial_record(self, payload): self.rows.append(payload)

        store = Store()
        service = FinancialRecordPersistenceService(client=store)
        app.dependency_overrides[get_financial_record_persistence_service] = lambda: service
        app.dependency_overrides[get_supabase_dependency] = lambda: store
        app.dependency_overrides[get_current_user] = lambda: TokenUser("u1", "a@b.co", "A")
        try:
            http = TestClient(app)
            ok = http.post("/api/v1/financial-records", json=record.model_dump(mode="json"))
            self.assertEqual(ok.status_code, 201)
            self.assertEqual(store.rows[0]["document_type"], "invoice")
            self.assertEqual(store.rows[0]["amount"], 1500.0)

            # Totals that do not reconcile need an explicit confirmation, like receipts.
            wrong = record.model_copy(deep=True, update={"record_id": "other", "total_amount": 1400.0})
            self.assertEqual(http.post("/api/v1/financial-records", json=wrong.model_dump(mode="json")).status_code, 409)
        finally:
            app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
