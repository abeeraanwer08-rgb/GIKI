from __future__ import annotations

import json
import unittest
from types import SimpleNamespace

from schemas.receipt import ReceiptAnalysisResponse, ReceiptItem
from services.financial_record_persistence import FinancialRecordPersistenceService
from services.receipt_analysis import SYSTEM_PROMPT, ReceiptAnalysisService
from services.ufr_mapper import UniversalFinancialRecordMapper
from services.validation import ReceiptValidationService


RESTAURANT_RECEIPT = {
    "merchant_name": "Pakistani Restaurant",
    "purchase_date": "2026-08-20",
    "currency": "PKR",
    "subtotal_amount": 7650,
    "service_charge": 765,
    "grand_total_amount": 8415,
    "total_amount": 8415,
    "items": [
        {
            "item_name": "MUTTON KARAHI FULL",
            "unit_price": 2500,
            "quantity": 1,
            "total_price": 2500,
            "category": "food",
        },
        {
            "item_name": "SP BIRYANI",
            "unit_price": 700,
            "quantity": 2,
            "total_price": 1400,
            "category": "food",
        },
        {
            "item_name": "PER HEAD ROTI",
            "unit_price": 60,
            "quantity": 5,
            "total_price": 300,
            "category": "food",
        },
        {
            "item_name": "RAITA",
            "unit_price": 120,
            "quantity": 5,
            "total_price": 600,
            "category": "food",
        },
        {
            "item_name": "MINERAL WATER",
            "unit_price": 150,
            "quantity": 1,
            "total_price": 150,
            "category": "beverages",
        },
        {
            "item_name": "DESI MURGH KARAHI FULL",
            "unit_price": 2500,
            "quantity": 1,
            "total_price": 2500,
            "category": "food",
        },
        {
            "item_name": "1.5 LTR DRINK",
            "unit_price": 200,
            "quantity": 1,
            "total_price": 200,
            "category": "beverages",
        },
    ],
}


class FakeOpenAIClient:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=self.create)
        )

    async def create(self, **kwargs):
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=json.dumps(self.payload))
                )
            ]
        )


class ReceiptAccuracyTests(unittest.IsolatedAsyncioTestCase):
    async def test_parser_preserves_table_semantics_and_final_total(self):
        service = ReceiptAnalysisService()
        service._client = FakeOpenAIClient(RESTAURANT_RECEIPT)

        result = await service.process_bytes(
            b"receipt-image",
            "restaurant-receipt.jpg",
            "image/jpeg",
        )

        self.assertEqual(result.total_amount, 8415)
        self.assertEqual(result.subtotal_amount, 7650)
        self.assertEqual(result.service_charge, 765)
        self.assertEqual(result.grand_total_amount, 8415)
        self.assertEqual(
            sum(item.total_price for item in result.items or []),
            7650,
        )
        self.assertEqual(result.items[1].unit_price, 700)
        self.assertEqual(result.items[1].quantity, 2)
        self.assertEqual(result.items[1].total_price, 1400)

    async def test_parser_keeps_unreadable_amount_null(self):
        payload = {
            **RESTAURANT_RECEIPT,
            "items": [
                {
                    "item_name": "SP BIRYANI",
                    "unit_price": 700,
                    "quantity": 2,
                    "total_price": None,
                    "category": "food",
                }
            ],
        }
        service = ReceiptAnalysisService()
        service._client = FakeOpenAIClient(payload)

        result = await service.process_bytes(
            b"receipt-image",
            "restaurant-receipt.jpg",
            "image/jpeg",
        )
        validation = ReceiptValidationService().validate_receipt(result)

        self.assertIsNone(result.items[0].total_price)
        self.assertFalse(validation.valid)
        self.assertIn("Line-item amount is missing", validation.errors[0])

    async def test_grand_total_wins_over_conflicting_raw_total(self):
        payload = {
            **RESTAURANT_RECEIPT,
            "total_amount": 4415,
        }
        service = ReceiptAnalysisService()
        service._client = FakeOpenAIClient(payload)

        result = await service.process_bytes(
            b"receipt-image",
            "restaurant-receipt.jpg",
            "image/jpeg",
        )
        validation = ReceiptValidationService().validate_receipt(result)
        record = UniversalFinancialRecordMapper().from_receipt_analysis(result)

        self.assertEqual(result.reported_total_amount, 4415)
        self.assertEqual(result.total_amount, 8415)
        self.assertTrue(
            any("conflicts with the extracted grand total" in warning
                for warning in validation.warnings)
        )
        self.assertEqual(record.total_amount, 8415)
        self.assertEqual(record.metadata.service_charge, 765)
        FinancialRecordPersistenceService.validate(record)

    def test_prompt_explicitly_distinguishes_rate_qty_and_amount(self):
        self.assertIn("map Rate to unit_price", SYSTEM_PROMPT)
        self.assertIn("map Qty to quantity", SYSTEM_PROMPT)
        self.assertIn("map Amount to total_price", SYSTEM_PROMPT)
        self.assertIn("Never substitute Rate for Amount", SYSTEM_PROMPT)
        self.assertIn("Service charges, taxes, delivery charges, and discounts are not line items", SYSTEM_PROMPT)

    def test_validation_and_ufr_mapping_preserve_service_charge(self):
        analysis = ReceiptAnalysisResponse(
            status="analysed",
            filename="restaurant-receipt.jpg",
            content_type="image/jpeg",
            size_bytes=100,
            message="ok",
            merchant_name="Pakistani Restaurant",
            purchase_date="2026-08-20",
            currency="PKR",
            subtotal_amount=7650,
            service_charge=765,
            grand_total_amount=8415,
            total_amount=8415,
            items=[
                ReceiptItem(
                    item_name=item["item_name"],
                    unit_price=item["unit_price"],
                    quantity=item["quantity"],
                    total_price=item["total_price"],
                    category=item["category"],
                )
                for item in RESTAURANT_RECEIPT["items"]
            ],
        )

        validation = ReceiptValidationService().validate_receipt(analysis)
        record = UniversalFinancialRecordMapper().from_receipt_analysis(
            analysis
        )

        self.assertTrue(validation.valid)
        self.assertEqual(validation.calculated_total, 7650)
        self.assertEqual(validation.subtotal_difference, 0)
        self.assertEqual(validation.service_charge, 765)
        self.assertEqual(validation.difference, 0)
        self.assertEqual(record.total_amount, 8415)
        self.assertEqual(record.items[1].amount, 1400)
        self.assertEqual(record.items[1].quantity, 2)
        self.assertEqual(record.items[1].unit_price, 700)
        self.assertEqual(record.metadata.service_charge, 765)

        # The existing save validation remains deterministic while accounting
        # for the explicitly extracted service charge.
        FinancialRecordPersistenceService.validate(record)
        payload = FinancialRecordPersistenceService.to_database_payload(record, "user-1")
        self.assertEqual(payload["metadata"]["service_charge"], 765)
