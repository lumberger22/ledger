"""
Optional API-key auth for remote deployments.

When API_KEY is not set (local dev), all requests pass through unchanged.
"""

import hmac
import logging

from fastapi import HTTPException, Request, status

from config import API_KEY
from services.rate_limit import SlidingWindowLimiter, get_client_ip

logger = logging.getLogger("ledger")

# /api/plaid/webhook doesn't carry X-API-Key because Plaid's servers, not
# the browser, call it -- it's authenticated a different way instead (JWT
# signature verification on the Plaid-Verification header, see
# services/plaid_client.verify_webhook and routers/plaid.py's webhook
# docstring), so it's exempt from this middleware specifically, not
# unauthenticated overall.
PUBLIC_PATHS = {"/api/health", "/api/plaid/webhook"}

# Lockout on repeated failed API keys, keyed by client IP. Ledger has no
# separate login endpoint -- the frontend just retries whatever /api/*
# request with the typed key -- so failures are counted here, in the same
# place the key is actually checked, rather than in a dedicated route.
# Blocking outright once the threshold is hit (rather than only slowing
# things down) also means a blocked IP doesn't get to try the real
# comparison at all, which blunts timing side channels on top of throughput.
MAX_FAILURES = 10
WINDOW_SECONDS = 300  # 5 minutes
_failure_limiter = SlidingWindowLimiter(max_events=MAX_FAILURES, window_seconds=WINDOW_SECONDS)


def verify_api_key(request: Request) -> None:
    """Raise 401/429 if the request lacks a valid API key (when auth is enabled)."""
    if not API_KEY:
        return

    path = request.url.path
    if path in PUBLIC_PATHS:
        return

    if not path.startswith("/api/"):
        return

    ip = get_client_ip(request)

    blocked, retry_after = _failure_limiter.is_blocked(ip)
    if blocked:
        logger.warning("Auth locked out: too many failed attempts from %s", ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {int(retry_after)}s.",
            headers={"Retry-After": str(int(retry_after))},
        )

    # Constant-time comparison — a plain `!=` leaks how many leading
    # characters matched via response timing, which matters here since the
    # API key doubles as this app's only password.
    provided = request.headers.get("X-API-Key") or ""
    if not hmac.compare_digest(provided, API_KEY):
        _failure_limiter.record_failure(ip)
        logger.warning("Auth failure from %s", ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
