import unittest

from services.categorization import CategorizationService


class CategorizationServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = CategorizationService()

    def categorize(self, merchant=None, items=(), document_type="receipt"):
        return self.service.categorize(
            document_type=document_type, merchant=merchant, item_descriptions=items
        )

    def test_document_type_wins_for_utility_bills_and_wallets(self):
        self.assertEqual(self.categorize("Anything", document_type="utility_bill").category, "utilities")
        result = self.categorize("Some Shop", document_type="wallet_screenshot")
        self.assertEqual((result.category, result.source), ("wallet", "document_type"))

    def test_pakistani_merchants_are_recognised(self):
        cases = {
            "K-Electric": "utilities",
            "SNGPL": "utilities",
            "Imtiaz Super Market": "groceries",
            "Karachi Grocers": "groceries",
            "Cheezious": "restaurant",
            "Cafe Flo": "restaurant",
            "Careem": "transport",
            "PSO Petrol Pump": "transport",
            "Khaadi": "shopping",
            "D. Watson Pharmacy": "health",
            "Easypaisa": "wallet",
        }
        for merchant, expected in cases.items():
            with self.subTest(merchant=merchant):
                result = self.categorize(merchant)
                self.assertEqual(result.category, expected)
                self.assertEqual(result.source, "merchant")

    def test_keywords_do_not_match_inside_other_words(self):
        # "mart" must not match "Smartphone Hub"; "lab" must not match "Label Co".
        self.assertEqual(self.categorize("Smartphone Hub").category, "other")
        self.assertEqual(self.categorize("Label Co").category, "other")

    def test_items_vote_when_merchant_is_unknown(self):
        result = self.categorize(
            "Ali Store", items=["Basmati Rice 5kg", "Fresh Milk 1L", "Chicken Burger"]
        )
        self.assertEqual((result.category, result.source), ("groceries", "items"))
        self.assertEqual(result.matched, "rice")

    def test_unknown_falls_back_to_other(self):
        result = self.categorize("Unknown Vendor", items=["Widget"])
        self.assertEqual((result.category, result.source), ("other", "default"))

    def test_categorize_row_keeps_existing_category(self):
        self.assertEqual(
            self.service.categorize_row({"category": "health", "merchant_provider": "KFC"}),
            "health",
        )
        self.assertEqual(
            self.service.categorize_row(
                {"category": None, "merchant_provider": None, "items": [{"description": "Cooking Oil 3L"}]}
            ),
            "groceries",
        )


if __name__ == "__main__":
    unittest.main()
