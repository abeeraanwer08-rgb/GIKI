import unittest

from services.financial_calculations import FinancialCalculationsService


class FinancialCalculationsServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = FinancialCalculationsService()

    def test_empty_records_produce_zeroed_summary(self):
        summary = self.service.summarize([])
        self.assertEqual(summary.record_count, 0)
        self.assertEqual(summary.total_amount, 0.0)
        self.assertEqual(summary.by_category, [])
        self.assertEqual(summary.by_month, [])
        self.assertEqual(summary.top_merchants, [])

    def test_totals_and_category_breakdown_are_summed_correctly(self):
        records = [
            {
                "amount": 500.0,
                "currency": "PKR",
                "category": "groceries",
                "merchant_provider": "Karachi Grocers",
                "transaction_date": "2026-08-12",
            },
            {
                "amount": 250.5,
                "currency": "PKR",
                "category": "groceries",
                "merchant_provider": "Karachi Grocers",
                "transaction_date": "2026-08-20",
            },
            {
                "amount": 1000.0,
                "currency": "PKR",
                "category": "utilities",
                "merchant_provider": "K-Electric",
                "transaction_date": "2026-09-01",
            },
        ]

        summary = self.service.summarize(records)

        self.assertEqual(summary.record_count, 3)
        self.assertEqual(summary.total_amount, 1750.5)
        self.assertEqual(summary.currency, "PKR")

        by_category = {row.category: row.total_amount for row in summary.by_category}
        self.assertEqual(by_category["groceries"], 750.5)
        self.assertEqual(by_category["utilities"], 1000.0)
        # Highest spend first.
        self.assertEqual(summary.by_category[0].category, "utilities")

        by_month = {row.month: row.total_amount for row in summary.by_month}
        self.assertEqual(by_month["2026-08"], 750.5)
        self.assertEqual(by_month["2026-09"], 1000.0)

        top_merchant = summary.top_merchants[0]
        self.assertEqual(top_merchant.category, "K-Electric")
        self.assertEqual(top_merchant.total_amount, 1000.0)

    def test_missing_category_falls_back_to_uncategorized(self):
        records = [{"amount": 100.0, "category": None}]
        summary = self.service.summarize(records)
        self.assertEqual(summary.by_category[0].category, "uncategorized")

    def test_records_without_amount_are_skipped_but_not_dropped_from_input(self):
        records = [
            {"amount": None, "category": "groceries"},
            {"amount": 200.0, "category": "groceries"},
        ]
        summary = self.service.summarize(records)
        self.assertEqual(summary.total_amount, 200.0)
        self.assertEqual(summary.by_category[0].record_count, 1)

    def test_records_without_merchant_are_excluded_from_top_merchants(self):
        records = [{"amount": 100.0, "category": "food", "merchant_provider": None}]
        summary = self.service.summarize(records)
        self.assertEqual(summary.top_merchants, [])

    def test_top_merchants_are_limited_to_five(self):
        records = [
            {"amount": float(i + 1), "merchant_provider": f"Merchant {i}"}
            for i in range(7)
        ]
        summary = self.service.summarize(records)
        self.assertEqual(len(summary.top_merchants), 5)
        # Highest amount first.
        self.assertEqual(summary.top_merchants[0].category, "Merchant 6")

    def test_records_without_date_are_excluded_from_monthly_breakdown(self):
        records = [{"amount": 100.0, "transaction_date": None}]
        summary = self.service.summarize(records)
        self.assertEqual(summary.by_month, [])
        self.assertEqual(summary.total_amount, 100.0)


if __name__ == "__main__":
    unittest.main()
