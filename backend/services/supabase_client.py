"""Small server-side Supabase REST client for HissabAI.

The client is intentionally lazy and is not imported by the upload path. This
milestone establishes persistence infrastructure without changing the public
API or writing records yet.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urlparse

import httpx


class SupabaseConfigurationError(RuntimeError):
    """Raised when required server-side Supabase configuration is missing."""


class SupabaseConnectionError(RuntimeError):
    """Raised when the Supabase REST API cannot be reached or authenticated."""


class SupabaseConflictError(SupabaseConnectionError):
    """Raised when Supabase rejects an insert because the record already exists."""


@dataclass(frozen=True)
class SupabaseVerificationResult:
    """Non-secret result of checking the configured Supabase REST endpoint."""

    reachable: bool
    schema_ready: bool
    status_code: int | None
    message: str


class SupabaseClient:
    """Authenticated REST client using the server-only service-role key."""

    _RECORDS_PATH = "/rest/v1/financial_records?select=id&limit=1"

    def __init__(
        self,
        *,
        url: str,
        service_role_key: str,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.url = self._validate_url(url)
        if not service_role_key.strip():
            raise SupabaseConfigurationError(
                "SUPABASE_SERVICE_ROLE_KEY is configured but empty."
            )

        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
        }
        self._http = http_client or httpx.Client(
            base_url=self.url,
            headers=self._headers,
            timeout=10.0,
        )

    @classmethod
    def from_environment(cls) -> "SupabaseClient":
        """Create one client from the required server-side environment values."""
        url = os.environ.get("SUPABASE_URL", "").strip()
        service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

        if not url:
            raise SupabaseConfigurationError(
                "SUPABASE_URL is not configured. Add it as a server-side "
                "environment variable."
            )
        if not service_role_key.strip():
            raise SupabaseConfigurationError(
                "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it as a "
                "server-side secret."
            )

        return cls(url=url, service_role_key=service_role_key)

    def verify_connection(self) -> SupabaseVerificationResult:
        """Check REST authentication and whether the initial table is available."""
        try:
            response = self._http.get(self._RECORDS_PATH, headers=self._headers)
        except httpx.HTTPError as exc:
            raise SupabaseConnectionError(
                f"Could not reach Supabase REST API: {exc.__class__.__name__}."
            ) from exc

        if response.is_success:
            return SupabaseVerificationResult(
                reachable=True,
                schema_ready=True,
                status_code=response.status_code,
                message="Supabase REST API reachable and financial_records is available.",
            )

        if response.status_code == 404:
            return SupabaseVerificationResult(
                reachable=True,
                schema_ready=False,
                status_code=response.status_code,
                message=(
                    "Supabase REST API reachable, but financial_records is not "
                    "available. Apply the initial migration."
                ),
            )

        if response.status_code in {401, 403}:
            raise SupabaseConnectionError(
                "Supabase REST API rejected the configured server credentials."
            )

        raise SupabaseConnectionError(
            f"Supabase REST API returned HTTP {response.status_code}."
        )

    def request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        """Send an authenticated request for future persistence services."""
        try:
            response = self._http.request(
                method,
                path,
                headers={**self._headers, **(headers or {})},
                json=json,
            )
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 409:
                raise SupabaseConflictError(
                    "Supabase rejected the insert because the record already exists."
                ) from exc
            raise SupabaseConnectionError(
                f"Supabase REST API returned HTTP {exc.response.status_code}."
            ) from exc
        except httpx.HTTPError as exc:
            raise SupabaseConnectionError(
                f"Could not reach Supabase REST API: {exc.__class__.__name__}."
            ) from exc

    def insert_financial_record(self, payload: dict[str, Any]) -> None:
        """Insert one record without allowing an existing ID to be overwritten."""
        self.request(
            "POST",
            "/rest/v1/financial_records",
            json=payload,
        )

    def insert_financial_records(
        self, payloads: list[dict[str, Any]], *, ignore_duplicates: bool = False
    ) -> int:
        """Insert several records in one request; returns how many were stored.

        With ``ignore_duplicates`` rows whose id already exists are skipped
        rather than failing the whole batch.
        """
        if not payloads:
            return 0
        if not ignore_duplicates:
            self.request("POST", "/rest/v1/financial_records", json=payloads)
            return len(payloads)
        response = self.request(
            "POST",
            "/rest/v1/financial_records?on_conflict=id",
            json=payloads,
            headers={"Prefer": "resolution=ignore-duplicates,return=representation"},
        )
        return len(response.json())

    @staticmethod
    def _record_filters(
        user_id: str,
        start_date: str | None,
        end_date: str | None,
        category: str | None,
    ) -> str:
        query = f"&user_id=eq.{quote(user_id, safe='')}"
        if start_date:
            query += f"&transaction_date=gte.{quote(start_date, safe='')}"
        if end_date:
            query += f"&transaction_date=lte.{quote(end_date, safe='')}"
        if category:
            query += f"&category=eq.{quote(category, safe='')}"
        return query

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
        """Fetch one page of a user's records, most recent first.

        ``start_date`` / ``end_date`` are inclusive ``YYYY-MM-DD`` bounds.
        """
        response = self.request(
            "GET",
            "/rest/v1/financial_records?select=*"
            + self._record_filters(user_id, start_date, end_date, category)
            + f"&order=transaction_date.desc.nullslast,id.asc&limit={limit}&offset={offset}",
        )
        return response.json()

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
        """One page of records plus the total number matching the filters."""
        response = self.request(
            "GET",
            "/rest/v1/financial_records?select=*"
            + self._record_filters(user_id, start_date, end_date, category)
            + f"&order=transaction_date.desc.nullslast,id.asc&limit={limit}&offset={offset}",
            headers={"Prefer": "count=exact"},
        )
        rows = response.json()
        # Content-Range looks like "0-24/133" (or "*/0" when empty).
        total = len(rows) + offset
        content_range = response.headers.get("content-range", "")
        if "/" in content_range:
            tail = content_range.rsplit("/", 1)[1]
            if tail.isdigit():
                total = int(tail)
        return rows, total

    def list_all_financial_records(
        self,
        user_id: str,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
        page_size: int = 1000,
        max_records: int = 20000,
    ) -> list[dict[str, Any]]:
        """Every record in the date range, fetched page by page (bounded)."""
        rows: list[dict[str, Any]] = []
        while len(rows) < max_records:
            page = self.list_financial_records(
                user_id,
                limit=page_size,
                offset=len(rows),
                start_date=start_date,
                end_date=end_date,
            )
            rows.extend(page)
            if len(page) < page_size:
                break
        return rows

    def list_budgets(self, user_id: str) -> list[dict[str, Any]]:
        """Fetch every category budget belonging to one user."""
        return self.request(
            "GET",
            f"/rest/v1/budgets?select=*&user_id=eq.{quote(user_id, safe='')}&order=category.asc",
        ).json()

    def upsert_budget(self, payload: dict[str, Any]) -> None:
        """Create or replace the budget for (payload['user_id'], payload['category'])."""
        self.request(
            "POST",
            "/rest/v1/budgets?on_conflict=user_id,category",
            json=payload,
            headers={"Prefer": "resolution=merge-duplicates"},
        )

    def delete_budget(self, user_id: str, category: str) -> None:
        self.request(
            "DELETE",
            f"/rest/v1/budgets?user_id=eq.{quote(user_id, safe='')}&category=eq.{quote(category, safe='')}",
        )

    def insert_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Create a user; raises SupabaseConflictError when the email already exists."""
        response = self.request(
            "POST",
            "/rest/v1/users",
            json=payload,
            headers={"Prefer": "return=representation"},
        )
        return response.json()[0]

    def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        rows = self.request(
            "GET", f"/rest/v1/users?select=*&email=eq.{quote(email, safe='')}&limit=1"
        ).json()
        return rows[0] if rows else None

    def close(self) -> None:
        """Release the underlying HTTP client."""
        self._http.close()

    @staticmethod
    def _validate_url(url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise SupabaseConfigurationError(
                "SUPABASE_URL must be a valid http(s) URL."
            )
        return url.rstrip("/")


_client: SupabaseClient | None = None


def get_supabase_client() -> SupabaseClient:
    """Return the process-level Supabase client, creating it only when needed."""
    global _client
    if _client is None:
        _client = SupabaseClient.from_environment()
    return _client


def reset_supabase_client() -> None:
    """Close and clear the cached client for tests or controlled shutdowns."""
    global _client
    if _client is not None:
        _client.close()
        _client = None