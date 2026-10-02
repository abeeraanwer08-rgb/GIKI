from __future__ import annotations

import io
import os
import time
import unittest
from typing import Any
from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient

from main import app
from routes.auth import get_auth_service
from routes.financial_records import get_supabase_dependency as records_supabase
from routes.receipt import MAX_UPLOAD_BYTES
from services.auth import AuthService
from services.passwords import hash_password, verify_password
from services.supabase_client import SupabaseConflictError
from services.tokens import (
    TOKEN_TTL_SECONDS,
    AuthConfigurationError,
    InvalidTokenError,
    TokenUser,
    issue_token,
    verify_token,
)

SECRET = "test-secret-" + "x" * 32


class FakeUserStore:
    def __init__(self) -> None:
        self.users: dict[str, dict[str, Any]] = {}

    def insert_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        if payload["email"] in self.users:
            raise SupabaseConflictError("exists")
        row = {"id": f"user-{len(self.users) + 1}", **payload}
        self.users[payload["email"]] = row
        return row

    def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        return self.users.get(email)


class PasswordTests(unittest.TestCase):
    def test_hash_verifies_and_is_salted(self):
        first, second = hash_password("correct horse"), hash_password("correct horse")
        self.assertNotEqual(first, second)
        self.assertNotIn("correct horse", first)
        self.assertTrue(verify_password("correct horse", first))
        self.assertFalse(verify_password("wrong horse", first))

    def test_malformed_hash_is_rejected_not_raised(self):
        for bad in ("", "plaintext", "scrypt$1$2", "bcrypt$a$b$c$d$e", "scrypt$x$8$1$AAAA$AAAA"):
            self.assertFalse(verify_password("anything", bad), bad)


@patch.dict(os.environ, {"AUTH_JWT_SECRET": SECRET})
class TokenTests(unittest.TestCase):
    USER = TokenUser("user-1", "ali@example.com", "Ali")

    def test_round_trip(self):
        self.assertEqual(verify_token(issue_token(self.USER)), self.USER)

    def test_expired_token_is_rejected(self):
        old = issue_token(self.USER, now=time.time() - TOKEN_TTL_SECONDS - 60)
        with self.assertRaises(InvalidTokenError):
            verify_token(old)

    def test_tampered_token_is_rejected(self):
        token = issue_token(self.USER)
        head, body, sig = token.split(".")
        forged = ".".join([head, body[:-2] + ("AA" if not body.endswith("AA") else "BB"), sig])
        with self.assertRaises(InvalidTokenError):
            verify_token(forged)

    def test_token_signed_with_another_secret_is_rejected(self):
        other = jwt.encode({"sub": "user-1", "exp": time.time() + 600}, "z" * 40, algorithm="HS256")
        with self.assertRaises(InvalidTokenError):
            verify_token(other)

    def test_alg_none_token_is_rejected(self):
        unsigned = jwt.encode({"sub": "user-1", "exp": time.time() + 600}, None, algorithm="none")
        with self.assertRaises(InvalidTokenError):
            verify_token(unsigned)

    def test_missing_or_short_secret_is_a_configuration_error(self):
        for secret in ("", "too-short"):
            with patch.dict(os.environ, {"AUTH_JWT_SECRET": secret}):
                with self.assertRaises(AuthConfigurationError):
                    issue_token(self.USER)


@patch.dict(os.environ, {"AUTH_JWT_SECRET": SECRET})
class AuthEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = FakeUserStore()
        app.dependency_overrides[get_auth_service] = lambda: AuthService(self.store)
        self.http = TestClient(app)

    def tearDown(self) -> None:
        self.http.close()
        app.dependency_overrides.clear()

    def signup(self, email="Ali@Example.com", password="longenough1", name="Ali"):
        return self.http.post("/api/v1/auth/signup", json={"name": name, "email": email, "password": password})

    def test_signup_returns_token_and_user_and_normalizes_email(self):
        response = self.signup()
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["user"]["email"], "ali@example.com")
        self.assertNotIn("password", str(body).lower())
        stored = self.store.users["ali@example.com"]
        self.assertNotEqual(stored["password_hash"], "longenough1")
        self.assertEqual(verify_token(body["token"]).id, body["user"]["id"])

    def test_duplicate_email_is_rejected_regardless_of_case(self):
        self.signup()
        response = self.signup(email="ALI@example.com")
        self.assertEqual(response.status_code, 409)

    def test_signup_validation(self):
        cases = {
            "short password": {"name": "Ali", "email": "a@b.co", "password": "short"},
            "bad email": {"name": "Ali", "email": "not-an-email", "password": "longenough1"},
            "blank name": {"name": "   ", "email": "a@b.co", "password": "longenough1"},
        }
        for label, payload in cases.items():
            with self.subTest(label):
                self.assertEqual(self.http.post("/api/v1/auth/signup", json=payload).status_code, 422)
        self.assertEqual(self.store.users, {})

    def test_login_succeeds_with_correct_password(self):
        self.signup()
        response = self.http.post("/api/v1/auth/login", json={"email": "ALI@example.com", "password": "longenough1"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["name"], "Ali")

    def test_wrong_password_and_unknown_email_give_the_same_answer(self):
        self.signup()
        wrong = self.http.post("/api/v1/auth/login", json={"email": "ali@example.com", "password": "nope-nope"})
        unknown = self.http.post("/api/v1/auth/login", json={"email": "ghost@example.com", "password": "nope-nope"})
        self.assertEqual((wrong.status_code, unknown.status_code), (401, 401))
        self.assertEqual(wrong.json(), unknown.json())

    def test_me_requires_a_valid_token(self):
        token = self.signup().json()["token"]
        ok = self.http.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual((ok.status_code, ok.json()["email"]), (200, "ali@example.com"))
        self.assertEqual(self.http.get("/api/v1/auth/me").status_code, 401)
        self.assertEqual(self.http.get("/api/v1/auth/me", headers={"Authorization": "Bearer junk"}).status_code, 401)

    def test_unconfigured_server_secret_returns_503_not_a_crash(self):
        with patch.dict(os.environ, {"AUTH_JWT_SECRET": ""}):
            self.assertEqual(self.signup(email="b@c.co").status_code, 503)


@patch.dict(os.environ, {"AUTH_JWT_SECRET": SECRET})
class ProtectionTests(unittest.TestCase):
    """Every data route must refuse anonymous callers and scope by the caller's id."""

    class RecordingClient:
        def __init__(self) -> None:
            self.asked_for: list[str] = []

        def list_financial_records_page(self, user_id: str, *, limit: int, **_filters):
            self.asked_for.append(user_id)
            return [], 0

    def setUp(self) -> None:
        self.http = TestClient(app)

    def tearDown(self) -> None:
        self.http.close()
        app.dependency_overrides.clear()

    def test_data_routes_require_sign_in(self):
        routes = [
            ("get", "/api/v1/financial-records"),
            ("post", "/api/v1/financial-records"),
            ("get", "/api/v1/insights"),
            ("get", "/api/v1/insights/summary"),
            ("post", "/api/v1/insights/ask"),
            ("get", "/api/v1/budgets"),
            ("put", "/api/v1/budgets/groceries"),
            ("delete", "/api/v1/budgets/groceries"),
            ("post", "/api/v1/receipt/upload"),
        ]
        for method, path in routes:
            with self.subTest(route=f"{method.upper()} {path}"):
                response = getattr(self.http, method)(path)
                self.assertEqual(response.status_code, 401)

    def test_each_user_only_ever_queries_their_own_records(self):
        recorder = self.RecordingClient()
        app.dependency_overrides[records_supabase] = lambda: recorder
        for name in ("alice", "bob"):
            token = issue_token(TokenUser(f"id-{name}", f"{name}@example.com", name))
            response = self.http.get("/api/v1/financial-records", headers={"Authorization": f"Bearer {token}"})
            self.assertEqual(response.status_code, 200)
        self.assertEqual(recorder.asked_for, ["id-alice", "id-bob"])

    def test_oversized_upload_is_rejected_before_processing(self):
        token = issue_token(TokenUser("id-1", "a@b.co", "A"))
        big = io.BytesIO(b"\x00" * (MAX_UPLOAD_BYTES + 1))
        response = self.http.post(
            "/api/v1/receipt/upload",
            files={"file": ("big.jpg", big, "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 413)


if __name__ == "__main__":
    unittest.main()
