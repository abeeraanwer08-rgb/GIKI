"""Sign-up and login against the users table."""

from __future__ import annotations

from typing import Any, Protocol

from services.passwords import DUMMY_HASH, hash_password, verify_password
from services.supabase_client import SupabaseConflictError, get_supabase_client
from services.tokens import TokenUser, issue_token


class EmailTakenError(Exception):
    """An account with this email already exists."""


class InvalidCredentialsError(Exception):
    """Deliberately vague: covers both an unknown email and a wrong password."""


class UserStore(Protocol):
    def insert_user(self, payload: dict[str, Any]) -> dict[str, Any]: ...
    def get_user_by_email(self, email: str) -> dict[str, Any] | None: ...


def normalize_email(email: str) -> str:
    return email.strip().lower()


class AuthService:
    def __init__(self, store: UserStore | None = None) -> None:
        self._store = store

    @property
    def store(self) -> UserStore:
        return self._store or get_supabase_client()

    def signup(self, *, name: str, email: str, password: str) -> tuple[TokenUser, str]:
        try:
            row = self.store.insert_user(
                {
                    "name": name.strip(),
                    "email": normalize_email(email),
                    "password_hash": hash_password(password),
                }
            )
        except SupabaseConflictError as exc:
            raise EmailTakenError() from exc
        return self._session(row)

    def login(self, *, email: str, password: str) -> tuple[TokenUser, str]:
        row = self.store.get_user_by_email(normalize_email(email))
        # Always run one hash verification so timing does not reveal whether the email exists.
        valid = verify_password(password, row["password_hash"] if row else DUMMY_HASH)
        if not row or not valid:
            raise InvalidCredentialsError()
        return self._session(row)

    @staticmethod
    def _session(row: dict[str, Any]) -> tuple[TokenUser, str]:
        user = TokenUser(id=str(row["id"]), email=row["email"], name=row["name"])
        return user, issue_token(user)

