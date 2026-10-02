"""In-memory rate limiting for the auth endpoints.

Two behaviours cover everything we need:

* ``retry_after(key)`` / ``record(key)`` count events in a sliding window and, once
  ``max_events`` is reached, refuse further attempts until the oldest ages out
  (or for ``lockout_seconds`` if given).
* ``reset(key)`` forgets a key (e.g. after a successful login).

State lives in this process. That is right for a single-worker deployment (the
default here); with several workers each would keep its own counters, so move
the same interface onto Redis or the database before scaling out.
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from typing import Callable

_SWEEP_THRESHOLD = 10_000


class RateLimiter:
    def __init__(
        self,
        *,
        max_events: int,
        window_seconds: float,
        lockout_seconds: float | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_events = max_events
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self._clock = clock
        self._events: dict[str, deque[float]] = {}
        self._locked_until: dict[str, float] = {}
        self._lock = threading.Lock()

    def _trim(self, key: str, now: float) -> deque[float]:
        events = self._events.setdefault(key, deque())
        while events and events[0] <= now - self.window_seconds:
            events.popleft()
        return events

    def _sweep(self, now: float) -> None:
        if len(self._events) < _SWEEP_THRESHOLD:
            return
        for key in list(self._events):
            events = self._trim(key, now)
            if not events and self._locked_until.get(key, 0) <= now:
                self._events.pop(key, None)
                self._locked_until.pop(key, None)

    def retry_after(self, key: str) -> int:
        """Seconds until ``key`` may try again; 0 when it is allowed now."""
        with self._lock:
            now = self._clock()
            locked = self._locked_until.get(key, 0.0)
            if locked > now:
                return math.ceil(locked - now)
            events = self._trim(key, now)
            if len(events) >= self.max_events:
                return math.ceil(events[0] + self.window_seconds - now)
            return 0

    def record(self, key: str) -> None:
        """Count one event; starts the lockout when the limit is reached."""
        with self._lock:
            now = self._clock()
            self._sweep(now)
            events = self._trim(key, now)
            events.append(now)
            if self.lockout_seconds and len(events) >= self.max_events:
                self._locked_until[key] = now + self.lockout_seconds
                events.clear()

    def reset(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)
            self._locked_until.pop(key, None)
