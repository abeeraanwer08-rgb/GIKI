from __future__ import annotations

import io
import sys
import os
import time
import unittest
from typing import Any
from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient

from main import app
from auth_fakes import Clock, FakeUserStore, MailSpy, make_limits
from routes.auth import get_auth_service, get_email_sender
from services.auth_limits import client_ip, get_auth_limits
from routes.financial_records import get_supabase_dependency as records_supabase
from routes.receipt import MAX_UPLOAD_BYTES
from services.auth import AuthService
from services.passwords import hash_password, verify_password
from services.tokens import (
    TOKEN_TTL_SECONDS,
    AuthConfigurationError,
    InvalidTokenError,
    TokenUser,
    issue_token,
    verify_token,
)

SECRET = "test-secret-" + "x" * 32



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


class AuthTestCase(unittest.TestCase):
    """A real app wired to in-memory stores, a movable clock and a mail spy."""

    def setUp(self) -> None:
        env = patch.dict(os.environ, {"AUTH_JWT_SECRET": SECRET})
        env.start()
        self.addCleanup(env.stop)
        self.clock = Clock()
        self.store = FakeUserStore(self.clock)
        self.mail = MailSpy()
        self.limits = make_limits(self.clock)
        self.service = AuthService(self.store, clock=self.clock, cache_seconds=0)
        app.dependency_overrides[get_auth_service] = lambda: self.service
        app.dependency_overrides[get_email_sender] = lambda: self.mail
        app.dependency_overrides[get_auth_limits] = lambda: self.limits
        self.http = TestClient(app)

    def tearDown(self) -> None:
        self.http.close()
        app.dependency_overrides.clear()

    def signup(self, email="Ali@Example.com", password="longenough1", name="Ali"):
        return self.http.post("/api/v1/auth/signup", json={"name": name, "email": email, "password": password})

    def login(self, email="ali@example.com", password="longenough1"):
        return self.http.post("/api/v1/auth/login", json={"email": email, "password": password})

    def bearer(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def verified_account(self, email="ali@example.com", password="longenough1") -> str:
        token = self.signup(email=email, password=password).json()["token"]
        self.store.verify(email)
        return token


class AuthEndpointTests(AuthTestCase):
    def test_signup_returns_token_and_user_and_normalizes_email(self):
        response = self.signup()
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["user"]["email"], "ali@example.com")
        self.assertFalse(body["user"]["email_verified"])
        self.assertNotIn("password", str(body).lower())
        stored = self.store.users["ali@example.com"]
        self.assertNotEqual(stored["password_hash"], "longenough1")
        self.assertEqual(verify_token(body["token"]).id, body["user"]["id"])

    def test_duplicate_email_is_rejected_regardless_of_case(self):
        self.signup()
        self.assertEqual(self.signup(email="ALI@example.com").status_code, 409)

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
        response = self.login(email="ALI@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["name"], "Ali")

    def test_wrong_password_and_unknown_email_give_the_same_answer(self):
        self.signup()
        wrong = self.login(password="nope-nope")
        unknown = self.login(email="ghost@example.com", password="nope-nope")
        self.assertEqual((wrong.status_code, unknown.status_code), (401, 401))
        self.assertEqual(wrong.json(), unknown.json())

    def test_me_requires_a_valid_token(self):
        token = self.signup().json()["token"]
        ok = self.http.get("/api/v1/auth/me", headers=self.bearer(token))
        self.assertEqual((ok.status_code, ok.json()["email"]), (200, "ali@example.com"))
        self.assertEqual(self.http.get("/api/v1/auth/me").status_code, 401)
        self.assertEqual(self.http.get("/api/v1/auth/me", headers=self.bearer("junk")).status_code, 401)

    def test_a_deleted_account_cannot_keep_using_its_token(self):
        token = self.signup().json()["token"]
        self.store.users.clear()
        self.assertEqual(self.http.get("/api/v1/auth/me", headers=self.bearer(token)).status_code, 401)

    def test_unconfigured_server_secret_returns_503_not_a_crash(self):
        with patch.dict(os.environ, {"AUTH_JWT_SECRET": ""}):
            self.assertEqual(self.signup(email="b@c.co").status_code, 503)

    def test_signup_is_rate_limited_per_network(self):
        for i in range(10):
            self.assertEqual(self.signup(email=f"u{i}@example.com").status_code, 201)
        blocked = self.signup(email="late@example.com")
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Retry-After", blocked.headers)
        self.clock.advance(3601)
        self.assertEqual(self.signup(email="late@example.com").status_code, 201)


class EmailVerificationTests(AuthTestCase):
    def test_signup_emails_a_six_digit_code_that_is_never_in_the_response_or_the_database(self):
        response = self.signup()
        self.assertEqual(len(self.mail.sent), 1)
        mail = self.mail.sent[0]
        self.assertEqual((mail["to"], mail["subject"]), ("ali@example.com", "Your HissabAI verification code"))
        code = self.mail.last_code()
        self.assertNotIn(code, response.text)
        self.assertNotIn(code, str(self.store.codes))
        self.assertEqual(len(self.store.codes), 1)

    def test_unverified_accounts_are_blocked_from_data_but_can_reach_the_verification_endpoints(self):
        token = self.signup().json()["token"]
        blocked = self.http.get("/api/v1/financial-records", headers=self.bearer(token))
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["detail"]["error"], "email_not_verified")
        me = self.http.get("/api/v1/auth/me", headers=self.bearer(token)).json()
        self.assertFalse(me["email_verified"])

    def test_the_right_code_verifies_and_unlocks_the_data_routes(self):
        token = self.signup().json()["token"]
        verified = self.http.post("/api/v1/auth/verify-email", json={"code": self.mail.last_code()}, headers=self.bearer(token))
        self.assertEqual((verified.status_code, verified.json()["email_verified"]), (200, True))
        app.dependency_overrides[records_supabase] = lambda: type("S", (), {"list_financial_records_page": lambda self, *a, **k: ([], 0)})()
        self.assertEqual(self.http.get("/api/v1/financial-records", headers=self.bearer(token)).status_code, 200)
        # the same token keeps working and a code cannot be replayed
        replay = self.http.post("/api/v1/auth/verify-email", json={"code": self.mail.last_code()}, headers=self.bearer(token))
        self.assertEqual(replay.status_code, 400)

    def test_wrong_codes_are_refused_and_five_of_them_burn_the_code(self):
        token = self.signup().json()["token"]
        good = self.mail.last_code()
        wrong = "000000" if good != "000000" else "111111"
        for _ in range(5):
            self.assertEqual(self.http.post("/api/v1/auth/verify-email", json={"code": wrong}, headers=self.bearer(token)).status_code, 400)
        # even the correct code no longer works: a new one has to be requested
        self.assertEqual(self.http.post("/api/v1/auth/verify-email", json={"code": good}, headers=self.bearer(token)).status_code, 400)
        self.clock.advance(61)
        self.assertEqual(self.http.post("/api/v1/auth/resend-verification", headers=self.bearer(token)).status_code, 202)
        fresh = self.http.post("/api/v1/auth/verify-email", json={"code": self.mail.last_code()}, headers=self.bearer(token))
        self.assertEqual(fresh.status_code, 200)

    def test_codes_expire_after_fifteen_minutes(self):
        token = self.signup().json()["token"]
        self.clock.advance(15 * 60 + 1)
        late = self.http.post("/api/v1/auth/verify-email", json={"code": self.mail.last_code()}, headers=self.bearer(token))
        self.assertEqual(late.status_code, 400)

    def test_resend_is_limited_to_once_a_minute_and_replaces_the_old_code(self):
        token = self.signup().json()["token"]
        old = self.mail.last_code()
        first = self.http.post("/api/v1/auth/resend-verification", headers=self.bearer(token))
        self.assertEqual(first.status_code, 202)
        again = self.http.post("/api/v1/auth/resend-verification", headers=self.bearer(token))
        self.assertEqual(again.status_code, 429)
        self.assertIn("Retry-After", again.headers)
        new = self.mail.last_code()
        if new != old:  # (1-in-a-million collision aside) the old code is dead
            stale = self.http.post("/api/v1/auth/verify-email", json={"code": old}, headers=self.bearer(token))
            self.assertEqual(stale.status_code, 400)

    def test_verifying_requires_being_signed_in(self):
        self.signup()
        self.assertEqual(self.http.post("/api/v1/auth/verify-email", json={"code": "123456"}).status_code, 401)

    def test_resend_for_an_already_verified_account_sends_nothing(self):
        token = self.verified_account()
        before = len(self.mail.sent)
        self.assertEqual(self.http.post("/api/v1/auth/resend-verification", headers=self.bearer(token)).status_code, 202)
        self.assertEqual(len(self.mail.sent), before)

    def test_verification_can_be_switched_off_for_local_development(self):
        token = self.signup().json()["token"]
        app.dependency_overrides[records_supabase] = lambda: type("S", (), {"list_financial_records_page": lambda self, *a, **k: ([], 0)})()
        with patch.dict(os.environ, {"REQUIRE_EMAIL_VERIFICATION": "false"}):
            self.assertEqual(self.http.get("/api/v1/financial-records", headers=self.bearer(token)).status_code, 200)
            self.assertTrue(self.login().json()["user"]["email_verified"])


class PasswordResetTests(AuthTestCase):
    def forgot(self, email="ali@example.com"):
        return self.http.post("/api/v1/auth/forgot-password", json={"email": email})

    def reset(self, code, new_password="brand-new-pass", email="ali@example.com"):
        return self.http.post("/api/v1/auth/reset-password", json={"email": email, "code": code, "new_password": new_password})

    def test_unknown_and_known_emails_get_the_same_answer_but_only_known_ones_get_mail(self):
        self.verified_account()
        sent_before = len(self.mail.sent)
        known = self.forgot()
        unknown = self.forgot("ghost@example.com")
        self.assertEqual((known.status_code, unknown.status_code), (202, 202))
        self.assertEqual(known.json(), unknown.json())
        self.assertEqual(len(self.mail.sent), sent_before + 1)
        self.assertEqual(self.mail.sent[-1]["subject"], "Your HissabAI password reset code")

    def test_the_code_sets_a_new_password_and_the_old_one_stops_working(self):
        self.verified_account()
        self.forgot()
        done = self.reset(self.mail.last_code())
        self.assertEqual(done.status_code, 200)
        self.assertEqual(self.login(password="longenough1").status_code, 401)
        self.assertEqual(self.login(password="brand-new-pass").status_code, 200)

    def test_existing_sessions_are_signed_out_by_a_reset(self):
        old_token = self.verified_account()
        self.assertEqual(self.http.get("/api/v1/auth/me", headers=self.bearer(old_token)).status_code, 200)
        self.forgot()
        self.reset(self.mail.last_code())
        self.assertEqual(self.http.get("/api/v1/auth/me", headers=self.bearer(old_token)).status_code, 401)
        fresh = self.login(password="brand-new-pass").json()["token"]
        self.assertEqual(self.http.get("/api/v1/auth/me", headers=self.bearer(fresh)).status_code, 200)

    def test_a_code_works_once_and_wrong_or_expired_codes_do_not(self):
        self.verified_account()
        self.forgot()
        code = self.mail.last_code()
        wrong = "000000" if code != "000000" else "111111"
        self.assertEqual(self.reset(wrong).status_code, 400)
        self.assertEqual(self.reset(code).status_code, 200)
        self.assertEqual(self.reset(code, "another-pass-1").status_code, 400)  # single use
        self.forgot()
        self.clock.advance(15 * 60 + 1)
        self.assertEqual(self.reset(self.mail.last_code()).status_code, 400)  # expired

    def test_an_unknown_email_cannot_be_told_apart_from_a_wrong_code(self):
        self.verified_account()
        self.forgot()
        wrong = self.reset("000000" if self.mail.last_code() != "000000" else "111111")
        ghost = self.reset("123456", email="ghost@example.com")
        self.assertEqual((wrong.status_code, ghost.status_code), (400, 400))
        self.assertEqual(wrong.json(), ghost.json())

    def test_resetting_also_verifies_an_unverified_address(self):
        self.signup()  # never verified
        self.forgot()
        self.reset(self.mail.last_code())
        self.assertTrue(self.login(password="brand-new-pass").json()["user"]["email_verified"])

    def test_the_new_password_must_be_strong_enough(self):
        self.verified_account()
        self.forgot()
        self.assertEqual(self.reset(self.mail.last_code(), new_password="short").status_code, 422)

    def test_reset_requests_are_limited_per_email_and_per_network(self):
        self.verified_account()
        for _ in range(3):
            self.assertEqual(self.forgot().status_code, 202)
        blocked = self.forgot()
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Retry-After", blocked.headers)
        # an email that does not exist is limited identically, so the limit leaks nothing
        for _ in range(3):
            self.forgot("ghost@example.com")
        self.assertEqual(self.forgot("ghost@example.com").status_code, 429)
        self.clock.advance(3601)
        self.assertEqual(self.forgot().status_code, 202)

    def test_guessing_codes_is_limited_per_network(self):
        self.verified_account()
        self.forgot()
        statuses = [self.reset("000001", new_password="brand-new-pass").status_code for _ in range(31)]
        self.assertEqual(statuses[-1], 429)


class LoginLockoutTests(AuthTestCase):
    def test_five_wrong_passwords_lock_the_account_even_against_the_right_password(self):
        self.verified_account()
        for _ in range(5):
            self.assertEqual(self.login(password="wrong-wrong").status_code, 401)
        locked = self.login()  # correct password, but locked out
        self.assertEqual(locked.status_code, 429)
        self.assertEqual(locked.headers["Retry-After"], "900")
        self.assertIn("15 minutes", locked.json()["detail"]["error"])

    def test_the_lock_lifts_after_fifteen_minutes(self):
        self.verified_account()
        for _ in range(5):
            self.login(password="wrong-wrong")
        self.clock.advance(15 * 60 + 1)
        self.assertEqual(self.login().status_code, 200)

    def test_a_successful_login_clears_the_failure_count(self):
        self.verified_account()
        for _ in range(4):
            self.login(password="wrong-wrong")
        self.assertEqual(self.login().status_code, 200)
        for _ in range(4):
            self.assertEqual(self.login(password="wrong-wrong").status_code, 401)  # count started over

    def test_unknown_emails_lock_exactly_like_real_ones(self):
        results = [self.login(email="ghost@example.com", password="x-x-x-x-x-x").status_code for _ in range(7)]
        self.assertEqual(results, [401] * 5 + [429] * 2)

    def test_one_network_cannot_try_endless_different_accounts(self):
        codes = [self.login(email=f"user{i}@example.com", password="x-x-x-x-x-x").status_code for i in range(22)]
        self.assertEqual(codes[:20], [401] * 20)
        self.assertEqual(codes[20:], [429, 429])

    def test_lockout_applies_to_the_submitted_email_in_any_letter_case(self):
        self.verified_account()
        for _ in range(5):
            self.login(email="ALI@Example.com", password="wrong-wrong")
        self.assertEqual(self.login(email="ali@example.com").status_code, 429)


class ClientAddressTests(unittest.TestCase):
    class Fake:
        def __init__(self, forwarded=None):
            self.headers = {"x-forwarded-for": forwarded} if forwarded else {}
            self.client = type("C", (), {"host": "10.0.0.5"})()

    def test_forwarded_header_is_ignored_unless_the_proxy_is_trusted(self):
        request = self.Fake("203.0.113.9, 10.0.0.1")
        self.assertEqual(client_ip(request), "10.0.0.5")
        with patch.dict(os.environ, {"TRUST_PROXY_HEADERS": "true"}):
            self.assertEqual(client_ip(request), "203.0.113.9")
            self.assertEqual(client_ip(self.Fake()), "10.0.0.5")


class ProtectionTests(AuthTestCase):
    """Every data route must refuse anonymous callers and scope by the caller's id."""

    class RecordingClient:
        def __init__(self) -> None:
            self.asked_for: list[str] = []

        def list_financial_records_page(self, user_id: str, *, limit: int, **_filters):
            self.asked_for.append(user_id)
            return [], 0

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
                self.assertEqual(getattr(self.http, method)(path).status_code, 401)

    def test_each_user_only_ever_queries_their_own_records(self):
        recorder = self.RecordingClient()
        app.dependency_overrides[records_supabase] = lambda: recorder
        ids = []
        for name in ("alice", "bob"):
            token = self.verified_account(email=f"{name}@example.com")
            ids.append(verify_token(token).id)
            self.assertEqual(self.http.get("/api/v1/financial-records", headers=self.bearer(token)).status_code, 200)
        self.assertEqual(recorder.asked_for, ids)

    def test_oversized_upload_is_rejected_before_processing(self):
        token = self.verified_account()
        big = io.BytesIO(b"\x00" * (MAX_UPLOAD_BYTES + 1))
        response = self.http.post(
            "/api/v1/receipt/upload",
            files={"file": ("big.jpg", big, "image/jpeg")},
            headers=self.bearer(token),
        )
        self.assertEqual(response.status_code, 413)

    def test_every_data_route_refuses_an_unverified_account(self):
        token = self.signup().json()["token"]
        for method, path in [("get", "/api/v1/financial-records"), ("get", "/api/v1/budgets"), ("get", "/api/v1/insights/summary"), ("post", "/api/v1/receipt/upload")]:
            with self.subTest(route=f"{method.upper()} {path}"):
                self.assertEqual(getattr(self.http, method)(path, headers=self.bearer(token)).status_code, 403)


class RateLimiterTests(unittest.TestCase):
    def test_window_slides_and_lockout_holds(self):
        from services.rate_limit import RateLimiter

        clock = Clock(1000.0)
        limiter = RateLimiter(max_events=3, window_seconds=60, clock=clock)
        for _ in range(3):
            self.assertEqual(limiter.retry_after("k"), 0)
            limiter.record("k")
        self.assertEqual(limiter.retry_after("k"), 60)
        clock.advance(20)
        self.assertEqual(limiter.retry_after("k"), 40)
        clock.advance(41)
        self.assertEqual(limiter.retry_after("k"), 0)

        locked = RateLimiter(max_events=2, window_seconds=60, lockout_seconds=300, clock=clock)
        locked.record("k"); locked.record("k")
        clock.advance(120)  # past the window, still locked out
        self.assertEqual(locked.retry_after("k"), 180)
        locked.reset("k")
        self.assertEqual(locked.retry_after("k"), 0)

    def test_keys_are_independent_and_memory_is_swept(self):
        from services import rate_limit
        from services.rate_limit import RateLimiter

        clock = Clock(0.0)
        limiter = RateLimiter(max_events=1, window_seconds=10, clock=clock)
        limiter.record("a")
        self.assertEqual(limiter.retry_after("b"), 0)
        with patch.object(rate_limit, "_SWEEP_THRESHOLD", 5):
            for i in range(10):
                limiter.record(f"old-{i}")
            clock.advance(100)
            limiter.record("trigger-sweep")
            self.assertLess(len(limiter._events), 5)


class EmailSenderTests(unittest.TestCase):
    def test_without_smtp_settings_the_console_sender_is_used_and_logs_the_message(self):
        from services.email_sender import ConsoleEmailSender, build_sender

        with patch.dict(os.environ, {"SMTP_HOST": ""}):
            sender = build_sender()
        self.assertIsInstance(sender, ConsoleEmailSender)
        with self.assertLogs("services.email_sender", level="WARNING") as logs:
            sender.send("a@b.co", "Subject", "Your code 123456")
        self.assertIn("123456", logs.output[0])

    def test_smtp_sender_uses_starttls_login_and_sends_a_two_part_message(self):
        from services.email_sender import SmtpEmailSender, build_sender

        env = {"SMTP_HOST": "smtp.example.com", "SMTP_PORT": "587", "SMTP_USER": "me", "SMTP_PASSWORD": "pw", "EMAIL_FROM": "HissabAI <hi@example.com>"}
        with patch.dict(os.environ, env):
            sender = build_sender()
        self.assertIsInstance(sender, SmtpEmailSender)
        with patch("services.email_sender.smtplib.SMTP") as smtp:
            server = smtp.return_value
            sender.send("to@example.com", "Hello", "plain", "<p>html</p>")
        smtp.assert_called_once_with("smtp.example.com", 587, timeout=15)
        server.starttls.assert_called_once()
        server.login.assert_called_once_with("me", "pw")
        message = server.send_message.call_args[0][0]
        self.assertEqual((message["To"], message["From"], message["Subject"]), ("to@example.com", "HissabAI <hi@example.com>", "Hello"))
        self.assertTrue(message.is_multipart())

    def test_port_465_uses_implicit_ssl(self):
        from services.email_sender import SmtpEmailSender

        sender = SmtpEmailSender(host="h", port=465, username=None, password=None, sender="x@y.z", use_ssl=True)
        with patch("services.email_sender.smtplib.SMTP_SSL") as ssl_smtp:
            sender.send("to@example.com", "S", "t")
        ssl_smtp.assert_called_once()

    def test_a_mail_failure_never_reaches_the_caller_and_names_are_escaped(self):
        from services.email_sender import code_email, send_safely

        class Boom:
            def send(self, *args, **kwargs):
                raise RuntimeError("smtp down")

        with self.assertLogs("services.email_sender", level="ERROR"):
            send_safely(Boom(), "a@b.co", "s", "t")
        _, text, html = code_email("reset_password", "<script>x</script> Ali", "123456", 15)
        self.assertNotIn("<script>", html)
        self.assertIn("123456", text)
        self.assertIn("reset your password", text)


if __name__ == "__main__":
    unittest.main()
