from __future__ import annotations

import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from auth_fakes import Clock, MailSpy, make_limits
from fastapi.testclient import TestClient

import env_loader
from main import app
from routes.auth import get_email_sender
from services import supabase_client, tokens
from services.auth_limits import get_auth_limits
from services.sqlite_store import SqliteStore
from services.supabase_client import (
    SupabaseConflictError,
    get_supabase_client,
    reset_supabase_client,
    storage_backend,
)

SECRET = "integration-secret-" + "x" * 30


def record(rid: str, user_id: str, date: str | None = "2026-09-10", amount: float = 100.0, category: str = "groceries", merchant: str = "Shop") -> dict:
    return {
        "id": rid, "user_id": user_id, "document_type": "receipt", "source": "t", "transaction_date": date,
        "merchant_provider": merchant, "amount": amount, "currency": "PKR", "category": category,
        "payment_method": None, "items": [{"description": "Rice", "amount": amount}], "metadata": {"source": "t", "k": [1, 2]},
        "confidence": 0.9, "parser_version": "t-v1",
    }


class StoreCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "nested" / "test.db"
        self.store = SqliteStore(self.path)
        self.ali = self.store.insert_user({"name": "Ali", "email": "ali@example.com", "password_hash": "h"})
        self.bob = self.store.insert_user({"name": "Bob", "email": "bob@example.com", "password_hash": "h"})


class UserTests(StoreCase):
    def test_database_file_and_folders_are_created_on_first_use(self):
        self.assertTrue(self.path.exists())

    def test_users_round_trip_and_emails_are_unique(self):
        self.assertEqual((self.ali["email_verified_at"], self.ali["token_version"]), (None, 0))
        self.assertEqual(self.store.get_user_by_email("ali@example.com")["id"], self.ali["id"])
        self.assertEqual(self.store.get_user_by_id(self.bob["id"])["name"], "Bob")
        self.assertIsNone(self.store.get_user_by_email("ghost@example.com"))
        with self.assertRaises(SupabaseConflictError):
            self.store.insert_user({"name": "Dup", "email": "ali@example.com", "password_hash": "h"})

    def test_update_only_touches_allowed_columns(self):
        updated = self.store.update_user(self.ali["id"], {"email_verified_at": "2026-01-01", "token_version": 3, "email": "evil@example.com", "id": "x"})
        self.assertEqual((updated["email_verified_at"], updated["token_version"], updated["email"]), ("2026-01-01", 3, "ali@example.com"))
        self.assertIsNone(self.store.update_user("missing", {"name": "x"}))

    def test_data_survives_a_new_connection_object(self):
        again = SqliteStore(self.path)
        self.assertEqual(again.get_user_by_email("ali@example.com")["name"], "Ali")


class AuthCodeTests(StoreCase):
    def test_newest_unconsumed_code_is_returned_and_consuming_retires_them(self):
        first = self.store.insert_auth_code({"user_id": self.ali["id"], "purpose": "verify_email", "code_hash": "a", "expires_at": "2099-01-01"})
        second = self.store.insert_auth_code({"user_id": self.ali["id"], "purpose": "verify_email", "code_hash": "b", "expires_at": "2099-01-01"})
        self.assertEqual(self.store.get_active_auth_code(self.ali["id"], "verify_email")["id"], second["id"])
        self.assertIsNone(self.store.get_active_auth_code(self.ali["id"], "reset_password"))
        self.store.update_auth_code(second["id"], {"attempts": 2, "code_hash": "ignored"})
        row = self.store.get_active_auth_code(self.ali["id"], "verify_email")
        self.assertEqual((row["attempts"], row["code_hash"]), (2, "b"))
        self.store.consume_auth_codes(self.ali["id"], "verify_email", "2026-10-02")
        self.assertIsNone(self.store.get_active_auth_code(self.ali["id"], "verify_email"))
        self.assertEqual(first["consumed_at"], None)  # (the earlier snapshot, not the row)

    def test_purpose_is_restricted(self):
        with self.assertRaises(Exception):
            self.store.insert_auth_code({"user_id": self.ali["id"], "purpose": "nonsense", "code_hash": "a", "expires_at": "x"})


class RecordTests(StoreCase):
    def test_json_columns_round_trip_and_duplicate_ids_conflict(self):
        self.store.insert_financial_record(record("r1", self.ali["id"]))
        row = self.store.list_financial_records(self.ali["id"])[0]
        self.assertEqual((row["items"], row["metadata"]["k"], row["amount"], row["confidence"]), ([{"description": "Rice", "amount": 100.0}], [1, 2], 100.0, 0.9))
        with self.assertRaises(SupabaseConflictError):
            self.store.insert_financial_record(record("r1", self.ali["id"]))
        self.assertEqual(len(self.store.list_financial_records(self.ali["id"])), 1)

    def test_batches_are_atomic_unless_duplicates_are_ignored(self):
        self.store.insert_financial_record(record("r1", self.ali["id"]))
        with self.assertRaises(SupabaseConflictError):
            self.store.insert_financial_records([record("r2", self.ali["id"]), record("r1", self.ali["id"])])
        self.assertEqual(len(self.store.list_financial_records(self.ali["id"])), 1)  # r2 rolled back
        stored = self.store.insert_financial_records([record("r2", self.ali["id"]), record("r1", self.ali["id"]), record("r3", self.ali["id"])], ignore_duplicates=True)
        self.assertEqual(stored, 2)
        self.assertEqual(self.store.insert_financial_records([], ignore_duplicates=True), 0)

    def test_each_user_only_sees_their_own_records(self):
        self.store.insert_financial_record(record("a", self.ali["id"]))
        self.store.insert_financial_record(record("b", self.bob["id"]))
        self.assertEqual([r["id"] for r in self.store.list_financial_records(self.ali["id"])], ["a"])
        self.assertEqual(self.store.list_financial_records_page(self.bob["id"], limit=10)[1], 1)

    def test_paging_ordering_filters_and_totals(self):
        for i in range(5):
            self.store.insert_financial_record(record(f"r{i}", self.ali["id"], date=f"2026-09-{10 + i:02d}", category="groceries" if i % 2 == 0 else "restaurant"))
        self.store.insert_financial_record(record("undated", self.ali["id"], date=None))
        rows, total = self.store.list_financial_records_page(self.ali["id"], limit=2)
        self.assertEqual(([r["id"] for r in rows], total), (["r4", "r3"], 6))  # newest first
        last, _ = self.store.list_financial_records_page(self.ali["id"], limit=10, offset=5)
        self.assertEqual([r["id"] for r in last], ["undated"])  # undated rows sort last
        ranged, count = self.store.list_financial_records_page(self.ali["id"], limit=10, start_date="2026-09-11", end_date="2026-09-13")
        self.assertEqual(([r["id"] for r in ranged], count), (["r3", "r2", "r1"], 3))
        cat, count = self.store.list_financial_records_page(self.ali["id"], limit=10, category="restaurant")
        self.assertEqual(([r["id"] for r in cat], count), (["r3", "r1"], 2))

    def test_list_all_pages_through_everything_and_respects_the_cap(self):
        self.store.insert_financial_records([record(f"r{i:03d}", self.ali["id"], date=f"2026-08-{1 + i % 28:02d}") for i in range(25)])
        self.assertEqual(len(self.store.list_all_financial_records(self.ali["id"], page_size=10)), 25)
        self.assertEqual(len(self.store.list_all_financial_records(self.ali["id"], page_size=10, max_records=20)), 20)
        self.assertEqual(len(self.store.list_all_financial_records(self.ali["id"], start_date="2026-08-20")), sum(1 for i in range(25) if 1 + i % 28 >= 20))

    def test_deleting_a_user_deletes_their_data(self):
        self.store.insert_financial_record(record("a", self.ali["id"]))
        self.store.upsert_budget({"user_id": self.ali["id"], "category": "groceries", "monthly_limit": 10})
        import sqlite3
        db = sqlite3.connect(self.path)
        db.execute("pragma foreign_keys = on")
        db.execute("delete from users where id = ?", (self.ali["id"],))
        db.commit()
        db.close()
        self.assertEqual(self.store.list_financial_records(self.ali["id"]), [])
        self.assertEqual(self.store.list_budgets(self.ali["id"]), [])

    def test_concurrent_writers_do_not_lose_rows(self):
        def write(n: int) -> None:
            self.store.insert_financial_records([record(f"t{n}-{i}", self.ali["id"]) for i in range(20)])

        threads = [threading.Thread(target=write, args=(n,)) for n in range(6)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(self.store.list_financial_records_page(self.ali["id"], limit=1)[1], 120)


class BudgetTests(StoreCase):
    def test_upsert_replaces_and_budgets_are_per_user(self):
        self.store.upsert_budget({"user_id": self.ali["id"], "category": "groceries", "monthly_limit": 1000})
        self.store.upsert_budget({"user_id": self.ali["id"], "category": "groceries", "monthly_limit": 2500, "currency": "PKR"})
        self.store.upsert_budget({"user_id": self.bob["id"], "category": "groceries", "monthly_limit": 7})
        self.store.upsert_budget({"user_id": self.ali["id"], "category": "health", "monthly_limit": 50})
        mine = self.store.list_budgets(self.ali["id"])
        self.assertEqual([(b["category"], b["monthly_limit"]) for b in mine], [("groceries", 2500.0), ("health", 50.0)])
        self.store.delete_budget(self.ali["id"], "groceries")
        self.assertEqual([b["category"] for b in self.store.list_budgets(self.ali["id"])], ["health"])
        self.assertEqual(self.store.list_budgets(self.bob["id"])[0]["monthly_limit"], 7.0)

    def test_non_positive_limits_are_refused_by_the_database(self):
        with self.assertRaises(Exception):
            self.store.upsert_budget({"user_id": self.ali["id"], "category": "x", "monthly_limit": 0})


class BackendSelectionTests(unittest.TestCase):
    def tearDown(self) -> None:
        reset_supabase_client()

    def test_sqlite_is_the_default_and_supabase_needs_a_url(self):
        with patch.dict(os.environ, {"SUPABASE_URL": "", "STORAGE_BACKEND": ""}):
            self.assertEqual(storage_backend(), "sqlite")
        with patch.dict(os.environ, {"SUPABASE_URL": "https://x.supabase.co", "STORAGE_BACKEND": ""}):
            self.assertEqual(storage_backend(), "supabase")
        with patch.dict(os.environ, {"SUPABASE_URL": "https://x.supabase.co", "STORAGE_BACKEND": "sqlite"}):
            self.assertEqual(storage_backend(), "sqlite")
        with patch.dict(os.environ, {"SUPABASE_URL": "", "STORAGE_BACKEND": "supabase"}):
            self.assertEqual(storage_backend(), "supabase")

    def test_the_process_client_follows_the_selection_and_the_db_path(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "chosen.db"
            with patch.dict(os.environ, {"SUPABASE_URL": "", "STORAGE_BACKEND": "", "HISSABAI_DB_PATH": str(target)}):
                client = get_supabase_client()
                self.assertIsInstance(client, SqliteStore)
                self.assertEqual(client.path, target)
                self.assertIs(get_supabase_client(), client)


class EnvLoaderTests(unittest.TestCase):
    def test_parses_files_without_overriding_the_real_environment(self):
        with tempfile.TemporaryDirectory() as folder:
            env = Path(folder) / ".env"
            env.write_text(
                "# comment\nFOO_NEW=bar\nQUOTED=\"hello world\"\nexport EXPORTED=1\nEMPTY=\n"
                "SECRETISH=replace-with-at-least-32-random-characters\nALREADY=from-file\nNOEQUALS\n",
                encoding="utf-8",
            )
            keys = ["FOO_NEW", "QUOTED", "EXPORTED", "EMPTY", "SECRETISH", "ALREADY"]
            with patch.dict(os.environ, {"ALREADY": "from-shell"}):
                for key in keys[:-1]:
                    os.environ.pop(key, None)
                self.assertEqual(env_loader.load_env_files((env, Path(folder) / "missing.env")), [env])
                self.assertEqual(
                    (os.environ["FOO_NEW"], os.environ["QUOTED"], os.environ["EXPORTED"], os.environ["ALREADY"]),
                    ("bar", "hello world", "1", "from-shell"),
                )
                self.assertNotIn("EMPTY", os.environ)
                self.assertNotIn("SECRETISH", os.environ)  # an unfilled template never becomes a secret


class LocalSecretTests(unittest.TestCase):
    def test_a_secret_is_generated_once_and_reused_when_none_is_configured(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "jwt_secret"
            env = {k: v for k, v in os.environ.items() if k != "AUTH_JWT_SECRET"}
            with patch.dict(os.environ, env, clear=True), patch.object(tokens, "_SECRET_FILE", target), patch.object(tokens, "_generated_secret", None):
                first = tokens.signing_secret()
                self.assertGreaterEqual(len(first), 32)
                self.assertEqual(target.read_text(encoding="utf-8"), first)
                with patch.object(tokens, "_generated_secret", None):
                    self.assertEqual(tokens.signing_secret(), first)  # a restart keeps tokens valid

    def test_an_explicitly_empty_or_short_secret_is_still_an_error(self):
        for value in ("", "short"):
            with patch.dict(os.environ, {"AUTH_JWT_SECRET": value}):
                with self.assertRaises(tokens.AuthConfigurationError):
                    tokens.signing_secret()


class FullStackOnSqliteTests(unittest.TestCase):
    """The real app, real auth, real SQLite file: nothing faked except email."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        env = patch.dict(os.environ, {"AUTH_JWT_SECRET": SECRET, "SUPABASE_URL": "", "STORAGE_BACKEND": "sqlite", "HISSABAI_DB_PATH": str(Path(self.tmp.name) / "app.db")})
        env.start()
        self.addCleanup(env.stop)
        reset_supabase_client()
        self.addCleanup(reset_supabase_client)
        self.mail = MailSpy()
        self.clock = Clock()
        app.dependency_overrides[get_email_sender] = lambda: self.mail
        app.dependency_overrides[get_auth_limits] = lambda: make_limits(self.clock)
        self.addCleanup(app.dependency_overrides.clear)
        self.http = TestClient(app)
        self.addCleanup(self.http.close)

    def account(self, email: str) -> dict[str, str]:
        token = self.http.post("/api/v1/auth/signup", json={"name": "Ali", "email": email, "password": "longenough1"}).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        self.assertEqual(self.http.post("/api/v1/auth/verify-email", json={"code": self.mail.last_code()}, headers=headers).status_code, 200)
        return headers

    def ufr(self, rid: str, total: float = 450.5, merchant: str = "Karachi Grocers", date: str = "2026-09-12") -> dict:
        return {
            "record_id": rid, "document_type": "receipt", "merchant": merchant, "document_date": date, "currency": "PKR",
            "total_amount": total, "payment_method": None, "category": None,
            "items": [{"description": "Rice", "amount": total, "metadata": {}}],
            "metadata": {"source": "receipt_analysis", "parser_version": "t"},
        }

    def test_signup_to_saved_expense_to_insights_to_budget_with_isolation_and_persistence(self):
        ali = self.account("ali@example.com")
        saved = self.http.post("/api/v1/financial-records", json=self.ufr("r1"), headers=ali)
        self.assertEqual((saved.status_code, saved.json()["category"]), (201, "groceries"))
        self.assertEqual(self.http.post("/api/v1/financial-records", json=self.ufr("r1"), headers=ali).status_code, 409)  # duplicate id
        self.http.post("/api/v1/financial-records", json=self.ufr("r2", 1200, "Cafe Flo", "2026-09-13"), headers=ali)

        listed = self.http.get("/api/v1/financial-records?limit=1", headers=ali).json()
        self.assertEqual((listed["total"], listed["has_more"], listed["records"][0]["merchant"]), (2, True, "Cafe Flo"))
        summary = self.http.get("/api/v1/insights/summary?start_date=2026-09-01&end_date=2026-09-30", headers=ali).json()
        self.assertEqual((summary["record_count"], summary["total_amount"]), (2, 1650.5))

        budget = self.http.put("/api/v1/budgets/groceries", json={"monthly_limit": 1000}, headers=ali)
        self.assertEqual(budget.status_code, 200)
        self.assertEqual(self.http.get("/api/v1/budgets", headers=ali).json()["budgets"][0]["category"], "groceries")

        bob = self.account("bob@example.com")
        self.assertEqual(self.http.get("/api/v1/financial-records", headers=bob).json()["total"], 0)
        self.assertEqual(self.http.get("/api/v1/budgets", headers=bob).json()["budgets"], [])

        # "Restart the server": drop the cached client; the file still has everything.
        reset_supabase_client()
        self.assertEqual(self.http.get("/api/v1/financial-records", headers=ali).json()["total"], 2)
        login = self.http.post("/api/v1/auth/login", json={"email": "ali@example.com", "password": "longenough1"})
        self.assertEqual((login.status_code, login.json()["user"]["email_verified"]), (200, True))

    def test_bank_statement_rows_are_stored_individually_and_never_double_counted(self):
        ali = self.account("ali@example.com")
        statement = {
            "record_id": "stmt-1", "document_type": "bank_statement", "merchant": "HBL", "document_date": "2026-09-30", "currency": "PKR",
            "total_amount": 5300.0, "payment_method": None, "category": None,
            "items": [
                {"description": "Imtiaz Super Market", "amount": 3450.0, "category": "groceries", "metadata": {"date": "2026-09-05", "balance": 66550.0}},
                {"description": "Cafe Flo", "amount": 1850.0, "category": "restaurant", "metadata": {"date": "2026-09-09", "balance": 64700.0}},
            ],
            "metadata": {"source": "bank_statement_analysis", "parser_version": "t"},
        }
        first = self.http.post("/api/v1/financial-records", json=statement, headers=ali)
        self.assertEqual((first.status_code, first.json()["records_saved"]), (201, 2))
        again = self.http.post("/api/v1/financial-records", json={**statement, "record_id": "stmt-2"}, headers=ali)
        self.assertEqual(again.status_code, 409)
        listed = self.http.get("/api/v1/financial-records", headers=ali).json()
        self.assertEqual((listed["total"], sorted(r["merchant"] for r in listed["records"])), (2, ["Cafe Flo", "Imtiaz Super Market"]))


if __name__ == "__main__":
    unittest.main()
