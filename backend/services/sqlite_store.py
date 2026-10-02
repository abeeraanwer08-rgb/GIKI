"""SQLite storage: the zero-setup database.

Implements the same methods as ``SupabaseClient`` so the rest of the backend does
not care which one it talks to. It is the default when no Supabase project is
configured, which makes the project run end to end with nothing to sign up for:
the data lives in one file (``backend/data/hissabai.db`` unless ``HISSABAI_DB_PATH``
says otherwise). Tables are created on first use.

SQLite is the right size for a demo, a single server and a few thousand records.
For several servers or heavier use, point the backend at Supabase instead.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from services.supabase_client import SupabaseConflictError, SupabaseConnectionError

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "hissabai.db"

SCHEMA = """
create table if not exists users (
    id text primary key,
    name text not null,
    email text not null unique check (email = lower(email)),
    password_hash text not null,
    email_verified_at text,
    token_version integer not null default 0,
    created_at text not null
);

create table if not exists financial_records (
    id text primary key,
    user_id text references users (id) on delete cascade,
    document_type text not null,
    source text not null,
    transaction_date text,
    merchant_provider text,
    amount real,
    currency text,
    category text,
    payment_method text,
    items text not null default '[]',
    metadata text not null default '{}',
    confidence real,
    parser_version text not null,
    created_at text not null,
    updated_at text not null
);
create index if not exists financial_records_user_idx
    on financial_records (user_id, transaction_date);

create table if not exists budgets (
    user_id text not null references users (id) on delete cascade,
    category text not null check (length(trim(category)) > 0),
    monthly_limit real not null check (monthly_limit > 0),
    currency text not null default 'PKR',
    updated_at text not null,
    primary key (user_id, category)
);

create table if not exists auth_codes (
    id text primary key,
    user_id text not null references users (id) on delete cascade,
    purpose text not null check (purpose in ('verify_email', 'reset_password')),
    code_hash text not null,
    attempts integer not null default 0,
    expires_at text not null,
    consumed_at text,
    created_at text not null
);
create index if not exists auth_codes_lookup_idx on auth_codes (user_id, purpose, created_at);
"""

_RECORD_COLUMNS = (
    "id", "user_id", "document_type", "source", "transaction_date", "merchant_provider", "amount",
    "currency", "category", "payment_method", "items", "metadata", "confidence", "parser_version",
)
_JSON_COLUMNS = ("items", "metadata")
_USER_PATCH_COLUMNS = {"name", "password_hash", "email_verified_at", "token_version"}
_CODE_PATCH_COLUMNS = {"attempts", "consumed_at"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row(cursor_row: sqlite3.Row | None) -> dict[str, Any] | None:
    if cursor_row is None:
        return None
    row = dict(cursor_row)
    for column in _JSON_COLUMNS:
        if column in row and isinstance(row[column], str):
            row[column] = json.loads(row[column])
    return row


class SqliteStore:
    """File-backed store with the same surface as ``SupabaseClient``."""

    def __init__(self, path: str | os.PathLike[str] | None = None) -> None:
        self.path = Path(path) if path else DEFAULT_DB_PATH
        self._ready = False
        self._lock = threading.Lock()

    @classmethod
    def from_environment(cls) -> "SqliteStore":
        return cls(os.environ.get("HISSABAI_DB_PATH") or None)

    # ── Connection handling ───────────────────────────────────────────────────

    def _initialise(self) -> None:
        with self._lock:
            if self._ready:
                return
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                connection = sqlite3.connect(self.path, timeout=15)
                try:
                    connection.execute("pragma journal_mode = wal")
                    connection.executescript(SCHEMA)
                    connection.commit()
                finally:
                    connection.close()
            except (OSError, sqlite3.Error) as exc:
                raise SupabaseConnectionError(f"Could not open the database file: {exc.__class__.__name__}.") from exc
            self._ready = True

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        """One short-lived connection per operation (safe across the threadpool)."""
        self._initialise()
        connection = sqlite3.connect(self.path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("pragma foreign_keys = on")
        try:
            with connection:  # commit on success, roll back on error
                yield connection
        except sqlite3.IntegrityError as exc:
            raise SupabaseConflictError("The record already exists.") from exc
        except sqlite3.Error as exc:
            raise SupabaseConnectionError(f"Database error: {exc.__class__.__name__}.") from exc
        finally:
            connection.close()

    def verify_connection(self) -> bool:
        with self._connect() as db:
            db.execute("select 1")
        return True

    def close(self) -> None:  # connections are per-operation; nothing to release
        return None

    # ── Users ─────────────────────────────────────────────────────────────────

    def insert_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        user_id = str(uuid.uuid4())
        with self._connect() as db:
            db.execute(
                "insert into users (id, name, email, password_hash, created_at) values (?, ?, ?, ?, ?)",
                (user_id, payload["name"], payload["email"], payload["password_hash"], _now()),
            )
            return _row(db.execute("select * from users where id = ?", (user_id,)).fetchone())  # type: ignore[return-value]

    def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        with self._connect() as db:
            return _row(db.execute("select * from users where email = ?", (email,)).fetchone())

    def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            return _row(db.execute("select * from users where id = ?", (user_id,)).fetchone())

    def update_user(self, user_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        columns = [c for c in patch if c in _USER_PATCH_COLUMNS]
        with self._connect() as db:
            if columns:
                db.execute(
                    f"update users set {', '.join(f'{c} = ?' for c in columns)} where id = ?",
                    [patch[c] for c in columns] + [user_id],
                )
            return _row(db.execute("select * from users where id = ?", (user_id,)).fetchone())

    # ── Auth codes ────────────────────────────────────────────────────────────

    def insert_auth_code(self, payload: dict[str, Any]) -> dict[str, Any]:
        code_id = str(uuid.uuid4())
        with self._connect() as db:
            db.execute(
                "insert into auth_codes (id, user_id, purpose, code_hash, expires_at, created_at) values (?, ?, ?, ?, ?, ?)",
                (code_id, payload["user_id"], payload["purpose"], payload["code_hash"], payload["expires_at"], _now()),
            )
            return _row(db.execute("select * from auth_codes where id = ?", (code_id,)).fetchone())  # type: ignore[return-value]

    def get_active_auth_code(self, user_id: str, purpose: str) -> dict[str, Any] | None:
        with self._connect() as db:
            return _row(
                db.execute(
                    "select * from auth_codes where user_id = ? and purpose = ? and consumed_at is null "
                    "order by created_at desc, rowid desc limit 1",
                    (user_id, purpose),
                ).fetchone()
            )

    def update_auth_code(self, code_id: str, patch: dict[str, Any]) -> None:
        columns = [c for c in patch if c in _CODE_PATCH_COLUMNS]
        if not columns:
            return
        with self._connect() as db:
            db.execute(
                f"update auth_codes set {', '.join(f'{c} = ?' for c in columns)} where id = ?",
                [patch[c] for c in columns] + [code_id],
            )

    def consume_auth_codes(self, user_id: str, purpose: str, when: str) -> None:
        with self._connect() as db:
            db.execute(
                "update auth_codes set consumed_at = ? where user_id = ? and purpose = ? and consumed_at is null",
                (when, user_id, purpose),
            )

    # ── Financial records ─────────────────────────────────────────────────────

    @staticmethod
    def _record_values(payload: dict[str, Any]) -> list[Any]:
        values = []
        for column in _RECORD_COLUMNS:
            value = payload.get(column)
            values.append(json.dumps(value if value is not None else ([] if column == "items" else {})) if column in _JSON_COLUMNS else value)
        now = _now()
        return values + [now, now]

    _INSERT_RECORD = (
        f"insert into financial_records ({', '.join(_RECORD_COLUMNS)}, created_at, updated_at) "
        f"values ({', '.join('?' for _ in _RECORD_COLUMNS)}, ?, ?)"
    )

    def insert_financial_record(self, payload: dict[str, Any]) -> None:
        """Insert one record; an existing id is a conflict, never an overwrite."""
        with self._connect() as db:
            db.execute(self._INSERT_RECORD, self._record_values(payload))

    def insert_financial_records(self, payloads: list[dict[str, Any]], *, ignore_duplicates: bool = False) -> int:
        """Insert several records atomically; returns how many were stored.

        With ``ignore_duplicates`` rows whose id already exists are skipped; otherwise
        any duplicate fails the whole batch.
        """
        if not payloads:
            return 0
        sql = self._INSERT_RECORD.replace("insert into", "insert or ignore into") if ignore_duplicates else self._INSERT_RECORD
        stored = 0
        with self._connect() as db:
            for payload in payloads:
                stored += db.execute(sql, self._record_values(payload)).rowcount
        return stored

    @staticmethod
    def _filters(user_id: str, start_date: str | None, end_date: str | None, category: str | None) -> tuple[str, list[Any]]:
        where, args = ["user_id = ?"], [user_id]
        if start_date:
            where.append("transaction_date >= ?")
            args.append(start_date)
        if end_date:
            where.append("transaction_date <= ?")
            args.append(end_date)
        if category:
            where.append("category = ?")
            args.append(category)
        return " and ".join(where), args

    _ORDER = "order by transaction_date is null, transaction_date desc, id asc"

    def list_financial_records(
        self,
        user_id: str,
        *,
        limit: int = 500,
        offset: int = 0,
        start_date: str | None = None,
        end_date: str | None = None,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        where, args = self._filters(user_id, start_date, end_date, category)
        with self._connect() as db:
            rows = db.execute(
                f"select * from financial_records where {where} {self._ORDER} limit ? offset ?", args + [limit, offset]
            ).fetchall()
        return [_row(r) for r in rows]  # type: ignore[misc]

    def list_financial_records_page(
        self,
        user_id: str,
        *,
        limit: int,
        offset: int = 0,
        start_date: str | None = None,
        end_date: str | None = None,
        category: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        where, args = self._filters(user_id, start_date, end_date, category)
        with self._connect() as db:
            total = db.execute(f"select count(*) from financial_records where {where}", args).fetchone()[0]
        rows = self.list_financial_records(
            user_id, limit=limit, offset=offset, start_date=start_date, end_date=end_date, category=category
        )
        return rows, int(total)

    def list_all_financial_records(
        self,
        user_id: str,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
        page_size: int = 1000,
        max_records: int = 20000,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        while len(rows) < max_records:
            page = self.list_financial_records(
                user_id, limit=page_size, offset=len(rows), start_date=start_date, end_date=end_date
            )
            rows.extend(page)
            if len(page) < page_size:
                break
        return rows

    # ── Budgets ───────────────────────────────────────────────────────────────

    def list_budgets(self, user_id: str) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("select * from budgets where user_id = ? order by category asc", (user_id,)).fetchall()
        return [_row(r) for r in rows]  # type: ignore[misc]

    def upsert_budget(self, payload: dict[str, Any]) -> None:
        with self._connect() as db:
            db.execute(
                "insert into budgets (user_id, category, monthly_limit, currency, updated_at) values (?, ?, ?, ?, ?) "
                "on conflict (user_id, category) do update set monthly_limit = excluded.monthly_limit, "
                "currency = excluded.currency, updated_at = excluded.updated_at",
                (payload["user_id"], payload["category"], payload["monthly_limit"], payload.get("currency") or "PKR", _now()),
            )

    def delete_budget(self, user_id: str, category: str) -> None:
        with self._connect() as db:
            db.execute("delete from budgets where user_id = ? and category = ?", (user_id, category))
