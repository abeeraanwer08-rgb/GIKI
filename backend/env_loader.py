"""Load ``.env`` files so the backend starts with plain ``uvicorn main:app``.

Reads ``<project>/.env`` and ``backend/.env`` (first one wins) and sets variables
that are not already set in the real environment, which always takes precedence.
Empty values and the placeholder text copied from ``.env.example``
(``replace-with-...``) are ignored, so an unfilled template can never become a
real, guessable secret.
"""

from __future__ import annotations

import os
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent
CANDIDATES = (_BACKEND.parent / ".env", _BACKEND / ".env")


def _parse(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key:
            values[key] = value
    return values


def load_env_files(paths: tuple[Path, ...] = CANDIDATES) -> list[Path]:
    """Apply the files; returns the ones that existed."""
    loaded: list[Path] = []
    for path in paths:
        if not path.is_file():
            continue
        loaded.append(path)
        for key, value in _parse(path.read_text(encoding="utf-8")).items():
            if not value or value.startswith("replace-with"):
                continue
            os.environ.setdefault(key, value)
    return loaded
