"""Rule-based spending categorisation tuned for Pakistani merchants.

Records saved from the mobile review screen usually arrive without a category,
which would leave spending insights and budgets unable to group them. This
service assigns one deterministically, in order of evidence strength:

1. the document type (utility bills and wallet transfers are unambiguous),
2. keywords in the merchant name,
3. keywords in the line-item descriptions (majority vote).

It never calls the LLM, so the same record always gets the same category and
the decision can be explained to the user ("matched 'k-electric'").
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Iterable

CATEGORIES: tuple[str, ...] = (
    "groceries",
    "restaurant",
    "utilities",
    "transport",
    "shopping",
    "health",
    "mobile",
    "wallet",
    "other",
)

DOCUMENT_TYPE_CATEGORIES = {
    "utility_bill": "utilities",
    "wallet_screenshot": "wallet",
}

CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "groceries": (
        "grocer", "grocery", "mart", "supermarket", "super market", "imtiaz",
        "carrefour", "metro cash", "al-fatah", "al fatah", "naheed", "chase up",
        "hyperstar", "greenvalley", "rice", "milk", "atta", "flour", "cooking oil",
        "ghee", "sugar", "daal", "vegetable", "fruit", "chicken", "eggs", "bread",
    ),
    "restaurant": (
        "restaurant", "cafe", "café", "cheezious", "kfc", "mcdonald", "pizza",
        "burger", "biryani", "karahi", "bbq", "tikka", "dhaba", "hardee",
        "subway", "foodpanda", "coffee", "chai", "kebab", "shawarma", "dine",
    ),
    "utilities": (
        "k-electric", "k electric", "lesco", "iesco", "mepco", "fesco", "pesco",
        "hesco", "gepco", "sui gas", "ssgc", "sngpl", "water board", "wasa",
        "ptcl", "electricity", "gas bill", "nayatel", "stormfiber", "internet",
    ),
    "transport": (
        "careem", "uber", "indrive", "yango", "bykea", "petrol", "fuel", "pso",
        "shell", "total parco", "attock", "metro bus", "rickshaw", "toll", "parking",
    ),
    "shopping": (
        "khaadi", "gul ahmed", "sapphire", "outfitters", "daraz", "junaid jamshed",
        "bata", "servis", "alkaram", "clothing", "apparel", "shoes", "mall",
    ),
    "health": (
        "pharmacy", "medical", "clinic", "hospital", "dawakhana", "d. watson",
        "d.watson", "servaid", "chughtai", "medicine", "lab",
    ),
    "mobile": (
        "zong", "telenor", "ufone", "mobilink", "jazz load", "top-up", "topup",
        "recharge", "mobile load",
    ),
    "wallet": ("easypaisa", "jazzcash", "jazz cash", "sadapay", "nayapay"),
}

_PATTERNS: dict[str, list[tuple[str, re.Pattern[str]]]] = {
    category: [
        (keyword, re.compile(rf"(?<![a-z]){re.escape(keyword)}s?(?![a-z])"))
        for keyword in keywords
    ]
    for category, keywords in CATEGORY_KEYWORDS.items()
}


@dataclass(frozen=True)
class CategorizationResult:
    category: str
    source: str  # "document_type" | "merchant" | "items" | "default"
    matched: str | None = None


def _match(text: str | None) -> tuple[str, str] | None:
    if not text:
        return None
    lowered = text.lower()
    for category, patterns in _PATTERNS.items():
        for keyword, pattern in patterns:
            if pattern.search(lowered):
                return category, keyword
    return None


class CategorizationService:
    """Assigns a spending category to a record from its type, merchant and items."""

    DEFAULT = "other"

    def categorize(
        self,
        *,
        document_type: str | None,
        merchant: str | None,
        item_descriptions: Iterable[str] = (),
    ) -> CategorizationResult:
        if document_type in DOCUMENT_TYPE_CATEGORIES:
            return CategorizationResult(DOCUMENT_TYPE_CATEGORIES[document_type], "document_type")

        merchant_match = _match(merchant)
        if merchant_match:
            return CategorizationResult(merchant_match[0], "merchant", merchant_match[1])

        votes: Counter[str] = Counter()
        first_keyword: dict[str, str] = {}
        for description in item_descriptions:
            item_match = _match(description)
            if item_match:
                votes[item_match[0]] += 1
                first_keyword.setdefault(item_match[0], item_match[1])
        if votes:
            category, _ = votes.most_common(1)[0]
            return CategorizationResult(category, "items", first_keyword[category])

        return CategorizationResult(self.DEFAULT, "default")

    def categorize_row(self, row: dict) -> str:
        """Category for a stored record row, deriving one when it was saved without."""
        if row.get("category"):
            return row["category"]
        items = row.get("items") or []
        return self.categorize(
            document_type=row.get("document_type"),
            merchant=row.get("merchant_provider"),
            item_descriptions=[i.get("description", "") for i in items if isinstance(i, dict)],
        ).category
