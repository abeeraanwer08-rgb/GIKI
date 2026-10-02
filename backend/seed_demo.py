"""Fill the database with a demo account and sample spending (no OpenAI needed).

    python seed_demo.py

Creates a verified user (demo@hissabai.app / DemoPass123), about three months of
categorised expenses and four budgets, so the dashboards, charts, insights and
budgets have something to show straight away. Safe to run again: the user and the
records are keyed so nothing is duplicated.
"""

from __future__ import annotations

import random
import uuid
from datetime import date, datetime, timedelta, timezone

from env_loader import load_env_files

load_env_files()

from services.categorization import CategorizationService  # noqa: E402
from services.passwords import hash_password  # noqa: E402
from services.supabase_client import SupabaseConflictError, get_supabase_client, storage_backend  # noqa: E402

EMAIL, PASSWORD, NAME = "demo@hissabai.app", "DemoPass123", "Demo User"
NAMESPACE = uuid.UUID("0b7c7c0e-4d5e-4c0e-9a5f-6d2f0a4b9e21")

MERCHANTS = [
    ("Karachi Grocers", "receipt", 2500, 7000),
    ("Imtiaz Super Market", "receipt", 3000, 9000),
    ("Monal Restaurant", "receipt", 2500, 7500),
    ("Cafe Flo", "receipt", 800, 2600),
    ("Cheezious", "receipt", 900, 2400),
    ("K-Electric", "utility_bill", 5500, 11000),
    ("SNGPL", "utility_bill", 1200, 3500),
    ("Careem", "receipt", 350, 1600),
    ("Easypaisa", "wallet_screenshot", 1000, 6000),
    ("Servaid Pharmacy", "receipt", 600, 3000),
    ("Khaadi", "receipt", 3500, 12000),
]
BUDGETS = {"groceries": 20000, "restaurant": 12000, "utilities": 15000, "transport": 6000}


def main() -> None:
    store = get_supabase_client()
    try:
        user = store.insert_user({"name": NAME, "email": EMAIL, "password_hash": hash_password(PASSWORD)})
        print(f"Created {EMAIL}")
    except SupabaseConflictError:
        user = store.get_user_by_email(EMAIL)
        print(f"{EMAIL} already exists")
    assert user is not None
    store.update_user(user["id"], {"email_verified_at": datetime.now(timezone.utc).isoformat()})

    rng, categorizer, today = random.Random(42), CategorizationService(), date.today()
    rows = []
    for n in range(75):
        merchant, document_type, low, high = MERCHANTS[n % len(MERCHANTS)]
        day = today - timedelta(days=int(n * 1.2) + rng.randint(0, 1))
        category = categorizer.categorize(document_type=document_type, merchant=merchant).category
        amount = float(rng.randrange(low, high, 10))
        rows.append(
            {
                "id": str(uuid.uuid5(NAMESPACE, f"{user['id']}|{n}")),
                "user_id": user["id"],
                "document_type": document_type,
                "source": "demo_seed",
                "transaction_date": day.isoformat(),
                "merchant_provider": merchant,
                "amount": amount,
                "currency": "PKR",
                "category": category,
                "payment_method": None,
                "items": [{"description": merchant, "amount": amount, "category": category, "metadata": {}}],
                "metadata": {"source": "demo_seed", "parser_version": "demo-seed-v1", "category_source": "demo"},
                "confidence": None,
                "parser_version": "demo-seed-v1",
            }
        )
    stored = store.insert_financial_records(rows, ignore_duplicates=True)
    for category, limit in BUDGETS.items():
        store.upsert_budget({"user_id": user["id"], "category": category, "monthly_limit": limit, "currency": "PKR"})
    print(f"Added {stored} expenses and {len(BUDGETS)} budgets to the {storage_backend()} database.")
    print(f"Sign in with  {EMAIL}  /  {PASSWORD}")


if __name__ == "__main__":
    main()
