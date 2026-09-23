import unittest
from datetime import date

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

    def test_missing_category_is_derived_or_falls_back_to_other(self):
        records = [
            {"amount": 100.0, "category": None},
            {"amount": 50.0, "category": None, "merchant_provider": "Cheezious"},
        ]
        summary = self.service.summarize(records)
        by_category = {row.category: row.total_amount for row in summary.by_category}
        self.assertEqual(by_category, {"other": 100.0, "restaurant": 50.0})

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

    def test_forecast_projects_month_to_date_spending_to_month_end(self):
        records = [
            {"amount": 3000.0, "transaction_date": "2026-09-05"},
            {"amount": 3000.0, "transaction_date": "2026-09-09"},
            {"amount": 9999.0, "transaction_date": "2026-08-30"},  # previous month
        ]
        summary = self.service.summarize(records, today=date(2026, 9, 10))
        forecast = summary.current_month
        self.assertEqual(forecast.month, "2026-09")
        self.assertEqual(forecast.spent_to_date, 6000.0)
        self.assertEqual((forecast.days_elapsed, forecast.days_in_month), (10, 30))
        self.assertEqual(forecast.projected_total, 18000.0)

    def test_no_forecast_without_records(self):
        self.assertIsNone(self.service.summarize([], today=date(2026, 9, 10)).current_month)

    def test_anomaly_flags_spend_far_above_category_median(self):
        records = [
            {"id": "a", "amount": 1000.0, "category": "restaurant", "merchant_provider": "Cafe A"},
            {"id": "b", "amount": 1200.0, "category": "restaurant", "merchant_provider": "Cafe B"},
            {"id": "c", "amount": 900.0, "category": "restaurant", "merchant_provider": "Cafe C"},
            {"id": "d", "amount": 4500.0, "category": "restaurant", "merchant_provider": "Fancy Grill"},
        ]
        anomalies = self.service.summarize(records).anomalies
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0].record_id, "d")
        self.assertEqual(anomalies[0].typical_amount, 1000.0)
        self.assertEqual(anomalies[0].ratio, 4.5)

    def test_anomalies_need_enough_history_in_the_category(self):
        records = [
            {"amount": 100.0, "category": "health"},
            {"amount": 5000.0, "category": "health"},
        ]
        self.assertEqual(self.service.summarize(records).anomalies, [])

    def test_records_without_date_are_excluded_from_monthly_breakdown(self):
        records = [{"amount": 100.0, "transaction_date": None}]
        summary = self.service.summarize(records)
        self.assertEqual(summary.by_month, [])
        self.assertEqual(summary.total_amount, 100.0)


if __name__ == "__main__":
    unittest.main()
