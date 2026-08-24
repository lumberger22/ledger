"""
Lightweight in-memory sliding-window rate limiting.

Process-local by design: fine for Ledger's single-instance EC2 deployment
(see SECURITY_HARDENING_PLAN.md SS1/SS2). State resets on restart and isn't
shared across multiple app instances -- acceptable for a single-user
personal app; note this if Ledger is ever scaled out to more than one
backend process.
"""

import time
from collections import defaultdict
from threading import Lock

from fastapi import Request


def get_client_ip(request: Request) -> str:
    """
    Best-effort client IP, aware of Ledger's Cloudflare-fronted production
    deployment (see routers/plaid.py's Cloudflare-aware comments elsewhere
    in this codebase). Cloudflare sets CF-Connecting-IP to the real client
    IP; X-Forwarded-For is a fallback for other proxies. request.client.host
    is the direct TCP peer, which is Cloudflare's own edge IP (same for
    every visitor) whenever Cloudflare is in front -- only trustworthy as a
    last resort / in local dev with no proxy.
    """
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class SlidingWindowLimiter:
    """Thread-safe, in-memory sliding-window counter keyed by an arbitrary string."""

    def __init__(self, max_events: int, window_seconds: float):
        self.max_events = max_events
        self.window_seconds = window_seconds
        self._events: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def _prune(self, key: str, now: float) -> list[float]:
        events = [t for t in self._events[key] if now - t < self.window_seconds]
        self._events[key] = events
        return events

    def hit(self, key: str) -> tuple[bool, float]:
        """
        Record an event for `key` right now and report whether it's within
        the limit. Returns (allowed, retry_after_seconds) -- retry_after is
        0 when allowed. Use this for straightforward "N requests per window"
        throttling where every call counts, whether it succeeds or not.
        """
        now = time.time()
        with self._lock:
            events = self._prune(key, now)
            if len(events) >= self.max_events:
                retry_after = self.window_seconds - (now - events[0])
                return False, max(retry_after, 1.0)
            events.append(now)
            return True, 0.0

    def record_failure(self, key: str) -> None:
        """Record an event without checking the limit (e.g. a failed auth attempt)."""
        now = time.time()
        with self._lock:
            events = self._prune(key, now)
            events.append(now)

    def is_blocked(self, key: str) -> tuple[bool, float]:
        """
        Check (without recording a new event) whether `key` is currently
        over the limit. Use this alongside record_failure() when you only
        want failures to count against the window, not every attempt (e.g.
        auth lockout: a correct key shouldn't reset or contribute to the
        failure count).
        """
        now = time.time()
        with self._lock:
            events = self._prune(key, now)
            if len(events) >= self.max_events:
                retry_after = self.window_seconds - (now - events[0])
                return True, max(retry_after, 1.0)
            return False, 0.0
