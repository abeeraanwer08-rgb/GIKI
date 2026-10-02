"""Shared fakes for the auth tests: an in-memory user/code store, a movable clock, a mail spy."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from services.rate_limit import RateLimiter
from services.auth_limits import AuthLimits, HOUR, MINUTE
from services.supabase_client import SupabaseConflictError


class Clock:
    def __init__(self, now: float = 1_800_000_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class FakeUserStore:
    """Implements the whole UserStore protocol (users and auth codes) in memory."""

    def __init__(self, clock: Clock | None = None) -> None:
        self.users: dict[str, dict[str, Any]] = {}  # by email
        self.codes: list[dict[str, Any]] = []
        self.clock = clock or Clock()

    # users
    def insert_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        if payload["email"] in self.users:
            raise SupabaseConflictError("exists")
        row = {
            "id": str(uuid.uuid4()), "email_verified_at": None, "token_version": 0,
            "created_at": datetime.fromtimestamp(self.clock(), timezone.utc).isoformat(), **payload,
        }
        self.users[payload["email"]] = row
        return dict(row)

    def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        row = self.users.get(email)
        return dict(row) if row else None

    def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        row = next((u for u in self.users.values() if u["id"] == user_id), None)
        return dict(row) if row else None

    def update_user(self, user_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        for row in self.users.values():
            if row["id"] == user_id:
                row.update(patch)
                return dict(row)
        return None

    # codes
    def insert_auth_code(self, payload: dict[str, Any]) -> dict[str, Any]:
        row = {"id": str(uuid.uuid4()), "attempts": 0, "consumed_at": None, **payload}
        self.codes.append(row)
        return dict(row)

    def get_active_auth_code(self, user_id: str, purpose: str) -> dict[str, Any] | None:
        live = [c for c in self.codes if c["user_id"] == user_id and c["purpose"] == purpose and c["consumed_at"] is None]
        return dict(live[-1]) if live else None

    def update_auth_code(self, code_id: str, patch: dict[str, Any]) -> None:
        next(c for c in self.codes if c["id"] == code_id).update(patch)

    def consume_auth_codes(self, user_id: str, purpose: str, when: str) -> None:
        for c in self.codes:
            if c["user_id"] == user_id and c["purpose"] == purpose and c["consumed_at"] is None:
                c["consumed_at"] = when

    # test helpers
    def verify(self, email: str) -> None:
        self.users[email]["email_verified_at"] = "2026-01-01T00:00:00+00:00"


class MailSpy:
    """Captures what would have been emailed."""

    def __init__(self) -> None:
        self.sent: list[dict[str, str]] = []

    def send(self, to: str, subject: str, text: str, html: str | None = None) -> None:
        self.sent.append({"to": to, "subject": subject, "text": text, "html": html or ""})

    def last_code(self) -> str:
        import re

        return re.search(r"\b(\d{6})\b", self.sent[-1]["text"]).group(1)


def make_limits(clock: Clock) -> AuthLimits:
    """Production limits, driven by the test clock."""
    return AuthLimits(
        login_by_email=RateLimiter(max_events=5, window_seconds=15 * MINUTE, lockout_seconds=15 * MINUTE, clock=clock),
        login_by_ip=RateLimiter(max_events=20, window_seconds=15 * MINUTE, lockout_seconds=15 * MINUTE, clock=clock),
        signup_by_ip=RateLimiter(max_events=10, window_seconds=HOUR, clock=clock),
        forgot_by_email=RateLimiter(max_events=3, window_seconds=HOUR, clock=clock),
        forgot_by_ip=RateLimiter(max_events=10, window_seconds=HOUR, clock=clock),
        code_by_ip=RateLimiter(max_events=30, window_seconds=15 * MINUTE, clock=clock),
        resend_by_user=RateLimiter(max_events=1, window_seconds=MINUTE, clock=clock),
    )
