"""Accounts: sign-up, login, email verification and password reset."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Protocol

from services.passwords import DUMMY_HASH, hash_password, verify_password
from services.supabase_client import SupabaseConflictError, get_supabase_client
from services.tokens import TokenUser, issue_token, signing_secret

CODE_TTL_SECONDS = 15 * 60
MAX_CODE_ATTEMPTS = 5
VERIFY_EMAIL = "verify_email"
RESET_PASSWORD = "reset_password"


class EmailTakenError(Exception):
    """An account with this email already exists."""


class InvalidCredentialsError(Exception):
    """Deliberately vague: covers both an unknown email and a wrong password."""


class InvalidCodeError(Exception):
    """The emailed code is wrong, expired, used up, or was never issued.

    One message for all of these so the answer reveals nothing about the account.
    """

    MESSAGE = "That code is incorrect or has expired. Request a new one."


class UserStore(Protocol):
    def insert_user(self, payload: dict[str, Any]) -> dict[str, Any]: ...
    def get_user_by_email(self, email: str) -> dict[str, Any] | None: ...
    def get_user_by_id(self, user_id: str) -> dict[str, Any] | None: ...
    def update_user(self, user_id: str, patch: dict[str, Any]) -> dict[str, Any] | None: ...
    def insert_auth_code(self, payload: dict[str, Any]) -> dict[str, Any]: ...
    def get_active_auth_code(self, user_id: str, purpose: str) -> dict[str, Any] | None: ...
    def update_auth_code(self, code_id: str, patch: dict[str, Any]) -> None: ...
    def consume_auth_codes(self, user_id: str, purpose: str, when: str) -> None: ...


@dataclass(frozen=True)
class Session:
    user: TokenUser
    token: str
    email_verified: bool


@dataclass(frozen=True)
class PendingCode:
    """A freshly issued code, ready to be emailed (the plain code is never stored)."""

    email: str
    name: str
    purpose: str
    code: str


def normalize_email(email: str) -> str:
    return email.strip().lower()


def verification_required() -> bool:
    """Email verification gates the data routes unless explicitly switched off (dev only)."""
    return os.environ.get("REQUIRE_EMAIL_VERIFICATION", "true").strip().lower() not in {"0", "false", "no", "off"}


def is_verified(row: dict[str, Any]) -> bool:
    return (not verification_required()) or row.get("email_verified_at") is not None


def hash_code(user_id: str, purpose: str, code: str) -> str:
    """Keyed hash: a leaked table of 6-digit codes can't simply be brute-forced offline."""
    return hmac.new(signing_secret().encode(), f"{user_id}:{purpose}:{code}".encode(), hashlib.sha256).hexdigest()


def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def _parse(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


class AuthService:
    def __init__(
        self,
        store: UserStore | None = None,
        *,
        clock: Callable[[], float] = time.time,
        cache_seconds: float = 30.0,
    ) -> None:
        self._store = store
        self._clock = clock
        self._cache_seconds = cache_seconds
        self._cache: dict[str, tuple[float, dict[str, Any]]] = {}

    @property
    def store(self) -> UserStore:
        return self._store or get_supabase_client()

    # ── Sessions ──────────────────────────────────────────────────────────────

    def signup(self, *, name: str, email: str, password: str) -> tuple[Session, PendingCode]:
        try:
            row = self.store.insert_user(
                {"name": name.strip(), "email": normalize_email(email), "password_hash": hash_password(password)}
            )
        except SupabaseConflictError as exc:
            raise EmailTakenError() from exc
        return self._session(row), self._issue_code(row, VERIFY_EMAIL)

    def login(self, *, email: str, password: str) -> Session:
        row = self.store.get_user_by_email(normalize_email(email))
        # Always run one hash verification so timing does not reveal whether the email exists.
        valid = verify_password(password, row["password_hash"] if row else DUMMY_HASH)
        if not row or not valid:
            raise InvalidCredentialsError()
        return self._session(row)

    def get_account(self, user_id: str) -> dict[str, Any] | None:
        """The user's current row (cached briefly), used to check every request."""
        now = self._clock()
        cached = self._cache.get(user_id)
        if cached and cached[0] > now:
            return cached[1]
        row = self.store.get_user_by_id(user_id)
        if row is None:
            self._cache.pop(user_id, None)
            return None
        self._cache[user_id] = (now + self._cache_seconds, row)
        return row

    def _invalidate(self, user_id: str) -> None:
        self._cache.pop(user_id, None)

    @staticmethod
    def user_from_row(row: dict[str, Any]) -> TokenUser:
        return TokenUser(
            id=str(row["id"]), email=row["email"], name=row["name"], token_version=int(row.get("token_version") or 0)
        )

    def _session(self, row: dict[str, Any]) -> Session:
        user = self.user_from_row(row)
        return Session(user=user, token=issue_token(user), email_verified=is_verified(row))

    # ── One-time codes ────────────────────────────────────────────────────────

    def _issue_code(self, row: dict[str, Any], purpose: str) -> PendingCode:
        user_id = str(row["id"])
        now = self._clock()
        self.store.consume_auth_codes(user_id, purpose, _iso(now))  # a new code replaces older ones
        code = f"{secrets.randbelow(10**6):06d}"
        self.store.insert_auth_code(
            {
                "user_id": user_id,
                "purpose": purpose,
                "code_hash": hash_code(user_id, purpose, code),
                "expires_at": _iso(now + CODE_TTL_SECONDS),
            }
        )
        return PendingCode(email=row["email"], name=row["name"], purpose=purpose, code=code)

    def _use_code(self, user_id: str, purpose: str, code: str) -> None:
        """Check a code, counting wrong guesses; consumed on success. Raises InvalidCodeError."""
        row = self.store.get_active_auth_code(user_id, purpose)
        now = self._clock()
        if row is None:
            raise InvalidCodeError()
        if _parse(row["expires_at"]) <= now or int(row.get("attempts") or 0) >= MAX_CODE_ATTEMPTS:
            self.store.update_auth_code(row["id"], {"consumed_at": _iso(now)})
            raise InvalidCodeError()
        if not hmac.compare_digest(hash_code(user_id, purpose, code.strip()), row["code_hash"]):
            self.store.update_auth_code(row["id"], {"attempts": int(row.get("attempts") or 0) + 1})
            raise InvalidCodeError()
        self.store.update_auth_code(row["id"], {"consumed_at": _iso(now)})

    # ── Email verification ────────────────────────────────────────────────────

    def resend_verification(self, user_id: str) -> PendingCode | None:
        """A new code, or ``None`` when the address is already verified."""
        row = self.store.get_user_by_id(user_id)
        if row is None or row.get("email_verified_at"):
            return None
        return self._issue_code(row, VERIFY_EMAIL)

    def verify_email(self, user_id: str, code: str) -> None:
        self._use_code(user_id, VERIFY_EMAIL, code)
        self.store.update_user(user_id, {"email_verified_at": _iso(self._clock())})
        self._invalidate(user_id)

    # ── Password reset ────────────────────────────────────────────────────────

    def request_password_reset(self, email: str) -> PendingCode | None:
        """A code to email, or ``None`` when no such account (the caller answers the same either way)."""
        row = self.store.get_user_by_email(normalize_email(email))
        return self._issue_code(row, RESET_PASSWORD) if row else None

    def reset_password(self, *, email: str, code: str, new_password: str) -> None:
        row = self.store.get_user_by_email(normalize_email(email))
        if row is None:
            hash_password(new_password)  # keep the unknown-email path as slow as the real one
            raise InvalidCodeError()
        user_id = str(row["id"])
        self._use_code(user_id, RESET_PASSWORD, code)
        patch: dict[str, Any] = {
            "password_hash": hash_password(new_password),
            # Every token issued before this moment stops working.
            "token_version": int(row.get("token_version") or 0) + 1,
        }
        # Proving control of the inbox by receiving the code also verifies the address.
        if not row.get("email_verified_at"):
            patch["email_verified_at"] = _iso(self._clock())
        self.store.update_user(user_id, patch)
        self.store.consume_auth_codes(user_id, VERIFY_EMAIL, _iso(self._clock()))
        self._invalidate(user_id)
