"""Signed access tokens (JWT, HS256)."""

from __future__ import annotations

import logging
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path

import jwt

logger = logging.getLogger(__name__)

TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
_MIN_SECRET_LENGTH = 32


class AuthConfigurationError(RuntimeError):
    """AUTH_JWT_SECRET is missing or too short."""


class InvalidTokenError(Exception):
    """The token is malformed, tampered with, or expired."""


@dataclass(frozen=True)
class TokenUser:
    id: str
    email: str
    name: str
    # Bumped on password reset so every token issued before it stops working.
    token_version: int = 0


_SECRET_FILE = Path(__file__).resolve().parents[1] / "data" / "jwt_secret"
_generated_secret: str | None = None


def _local_secret() -> str:
    """A random secret kept in ``backend/data/jwt_secret`` for zero-setup local runs.

    Used only when AUTH_JWT_SECRET is not set at all. Fine for one machine; on
    hosting with a disk that is wiped on restart it would sign everyone out each
    time, so set AUTH_JWT_SECRET there.
    """
    global _generated_secret
    if _generated_secret:
        return _generated_secret
    try:
        existing = _SECRET_FILE.read_text(encoding="utf-8").strip() if _SECRET_FILE.exists() else ""
        if len(existing) < _MIN_SECRET_LENGTH:
            existing = secrets.token_urlsafe(48)
            _SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
            _SECRET_FILE.write_text(existing, encoding="utf-8")
            try:
                _SECRET_FILE.chmod(0o600)
            except OSError:
                pass
            logger.warning("AUTH_JWT_SECRET is not set; generated a local one at %s.", _SECRET_FILE)
    except OSError:
        existing = secrets.token_urlsafe(48)  # read-only disk: valid until the process restarts
    _generated_secret = existing
    return existing


def signing_secret() -> str:
    configured = os.environ.get("AUTH_JWT_SECRET")
    secret = _local_secret() if configured is None else configured
    if len(secret) < _MIN_SECRET_LENGTH:
        raise AuthConfigurationError(
            f"AUTH_JWT_SECRET must be set to a random string of at least {_MIN_SECRET_LENGTH} characters."
        )
    return secret


def issue_token(user: TokenUser, *, now: float | None = None) -> str:
    issued = int(now if now is not None else time.time())
    claims = {
        "sub": user.id,
        "email": user.email,
        "name": user.name,
        "tv": user.token_version,
        "iat": issued,
        "exp": issued + TOKEN_TTL_SECONDS,
    }
    return jwt.encode(claims, signing_secret(), algorithm="HS256")


def verify_token(token: str) -> TokenUser:
    try:
        # Pin the algorithm: never let the token choose how it is verified.
        claims = jwt.decode(token, signing_secret(), algorithms=["HS256"], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
    return TokenUser(
        id=claims["sub"],
        email=claims.get("email", ""),
        name=claims.get("name", ""),
        token_version=int(claims.get("tv", 0)),
    )
