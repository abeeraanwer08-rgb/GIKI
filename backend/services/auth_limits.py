"""The rate limits applied to the auth endpoints (see ADR-0013)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from fastapi import Request

from services.rate_limit import RateLimiter

MINUTE, HOUR = 60, 3600


@dataclass
class AuthLimits:
    # Wrong-password attempts. Keyed by the *submitted* email whether or not it
    # exists, so a lockout reveals nothing about which accounts are real.
    login_by_email: RateLimiter = field(
        default_factory=lambda: RateLimiter(max_events=5, window_seconds=15 * MINUTE, lockout_seconds=15 * MINUTE)
    )
    login_by_ip: RateLimiter = field(
        default_factory=lambda: RateLimiter(max_events=20, window_seconds=15 * MINUTE, lockout_seconds=15 * MINUTE)
    )
    signup_by_ip: RateLimiter = field(default_factory=lambda: RateLimiter(max_events=10, window_seconds=HOUR))
    forgot_by_email: RateLimiter = field(default_factory=lambda: RateLimiter(max_events=3, window_seconds=HOUR))
    forgot_by_ip: RateLimiter = field(default_factory=lambda: RateLimiter(max_events=10, window_seconds=HOUR))
    # Guesses at an emailed code (the code itself also locks after 5 wrong tries).
    code_by_ip: RateLimiter = field(default_factory=lambda: RateLimiter(max_events=30, window_seconds=15 * MINUTE))
    resend_by_user: RateLimiter = field(default_factory=lambda: RateLimiter(max_events=1, window_seconds=MINUTE))


_limits = AuthLimits()


def get_auth_limits() -> AuthLimits:
    return _limits


def client_ip(request: Request) -> str:
    """The caller's address. Behind a reverse proxy set TRUST_PROXY_HEADERS=true to
    use the first X-Forwarded-For hop; otherwise that header is ignored (it is
    trivially spoofed when the app is exposed directly)."""
    if os.environ.get("TRUST_PROXY_HEADERS", "").strip().lower() in {"1", "true", "yes"}:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
