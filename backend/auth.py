"""
Optional API-key auth for remote deployments.

When API_KEY is not set (local dev), all requests pass through unchanged.
"""
from fastapi import HTTPException, Request, status

from config import API_KEY

PUBLIC_PATHS = {"/api/health"}


def verify_api_key(request: Request) -> None:
    """Raise 401 if the request lacks a valid API key (when auth is enabled)."""
    if not API_KEY:
        return

    path = request.url.path
    if path in PUBLIC_PATHS:
        return

    if not path.startswith("/api/"):
        return

    provided = request.headers.get("X-API-Key")
    if provided != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
