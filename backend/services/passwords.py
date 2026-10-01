"""Password hashing with scrypt from the standard library.

Stored format: ``scrypt$<n>$<r>$<p>$<salt_b64>$<hash_b64>`` so the cost
parameters travel with each hash and can be raised later without breaking
existing users.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

# OWASP-recommended minimum for scrypt: N=2^17, r=8, p=1 (~128 MiB). The mobile
# demo backend runs on small instances, so use N=2^15 (~32 MiB), still well above
# interactive-login brute-force economics, and stored per hash for later upgrades.
_N = 2**15
_R = 8
_P = 1
_SALT_BYTES = 16
_KEY_BYTES = 32
_MAXMEM = 64 * 1024 * 1024


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=_KEY_BYTES, maxmem=_MAXMEM
    )


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    key = _derive(password, salt, _N, _R, _P)
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(key)}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check; returns False (never raises) for malformed hashes."""
    try:
        scheme, n, r, p, salt_b64, key_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(key_b64)
        actual = _derive(password, salt, int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Verified against when an email is unknown, so "no such user" and "wrong
# password" take about the same time and cannot be told apart by timing.
DUMMY_HASH = hash_password("not-a-real-password")
