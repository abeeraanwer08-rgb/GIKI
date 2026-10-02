import unittest

from fastapi.testclient import TestClient

from main import app


class CorsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.http = TestClient(app)

    def tearDown(self) -> None:
        self.http.close()

    def preflight(self, origin: str):
        return self.http.options(
            "/api/v1/financial-records",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )

    def test_web_dev_origin_may_call_the_api_with_a_bearer_token(self):
        response = self.preflight("http://localhost:5173")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")
        self.assertIn("authorization", response.headers["access-control-allow-headers"].lower())

    def test_unknown_origins_are_not_allowed(self):
        response = self.preflight("https://evil.example.com")
        self.assertNotIn("access-control-allow-origin", response.headers)

    def test_cookies_are_never_allowed(self):
        response = self.preflight("http://localhost:5173")
        self.assertNotIn("access-control-allow-credentials", response.headers)


if __name__ == "__main__":
    unittest.main()
