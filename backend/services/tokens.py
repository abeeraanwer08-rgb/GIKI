"""Signed access tokens (JWT, HS256)."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass

import jwt

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


def signing_secret() -> str:
    secret = os.environ.get("AUTH_JWT_SECRET", "")
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
