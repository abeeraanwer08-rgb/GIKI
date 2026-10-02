import os
import unittest
from unittest.mock import patch

import httpx

from services.supabase_client import (
    SupabaseClient,
    SupabaseConfigurationError,
)


def _client(handler) -> SupabaseClient:
    return SupabaseClient(
        url="https://example.supabase.co",
        service_role_key="server-key",
        http_client=httpx.Client(
            base_url="https://example.supabase.co", transport=httpx.MockTransport(handler)
        ),
    )


class SupabaseListingTests(unittest.TestCase):
    def test_date_range_category_and_paging_become_postgrest_filters(self):
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json=[{"id": "a"}], headers={"content-range": "20-20/21"})

        rows, total = _client(handler).list_financial_records_page(
            "user-1", limit=10, offset=20, start_date="2026-09-01", end_date="2026-09-30", category="groceries"
        )
        params = seen[0].url.params
        self.assertEqual(params["user_id"], "eq.user-1")
        self.assertEqual(
            params.get_list("transaction_date"), ["gte.2026-09-01", "lte.2026-09-30"]
        )
        self.assertEqual(params["category"], "eq.groceries")
        self.assertEqual((params["limit"], params["offset"]), ("10", "20"))
        self.assertEqual(seen[0].headers["prefer"], "count=exact")
        self.assertEqual((rows, total), ([{"id": "a"}], 21))

    def test_total_falls_back_when_content_range_is_missing(self):
        client = _client(lambda r: httpx.Response(200, json=[{"id": "a"}, {"id": "b"}]))
        self.assertEqual(client.list_financial_records_page("u", limit=5, offset=3)[1], 5)

    def test_list_all_pages_until_a_short_page(self):
        offsets: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            offsets.append(request.url.params["offset"])
            size = 3 if request.url.params["offset"] != "6" else 1
            return httpx.Response(200, json=[{"id": "x"}] * size)

        rows = _client(handler).list_all_financial_records("u", page_size=3)
        self.assertEqual((len(rows), offsets), (7, ["0", "3", "6"]))

    def test_list_all_respects_the_safety_cap(self):
        client = _client(lambda r: httpx.Response(200, json=[{"id": "x"}] * 3))
        self.assertEqual(len(client.list_all_financial_records("u", page_size=3, max_records=9)), 9)


class SupabaseClientTests(unittest.TestCase):
    def test_missing_url_fails_with_clear_configuration_error(self):
        with patch.dict(
            os.environ,
            {"SUPABASE_URL": "", "SUPABASE_SERVICE_ROLE_KEY": "server-key"},
            clear=False,
        ):
            with self.assertRaisesRegex(
                SupabaseConfigurationError, "SUPABASE_URL is not configured"
            ):
                SupabaseClient.from_environment()

    def test_missing_service_role_key_fails_with_clear_configuration_error(self):
        with patch.dict(
            os.environ,
            {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": ""},
            clear=False,
        ):
            with self.assertRaisesRegex(
                SupabaseConfigurationError,
                "SUPABASE_SERVICE_ROLE_KEY is not configured",
            ):
                SupabaseClient.from_environment()

    def test_initializes_and_verifies_without_exposing_key(self):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.headers["apikey"] == "server-key"
            assert request.headers["authorization"] == "Bearer server-key"
            return httpx.Response(200, json=[])

        http_client = httpx.Client(
            base_url="https://example.supabase.co",
            transport=httpx.MockTransport(handler),
        )
        client = SupabaseClient(
            url="https://example.supabase.co",
            service_role_key="server-key",
            http_client=http_client,
        )

        result = client.verify_connection()

        self.assertTrue(result.reachable)
        self.assertTrue(result.schema_ready)
        self.assertNotIn("server-key", result.message)
        client.close()

    def test_missing_initial_table_is_reachable_but_not_schema_ready(self):
        http_client = httpx.Client(
            base_url="https://example.supabase.co",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(404, json={"message": "not found"})
            ),
        )
        client = SupabaseClient(
            url="https://example.supabase.co",
            service_role_key="server-key",
            http_client=http_client,
        )

        result = client.verify_connection()

        self.assertTrue(result.reachable)
        self.assertFalse(result.schema_ready)
        self.assertIn("financial_records", result.message)
        client.close()


if __name__ == "__main__":
    unittest.main()