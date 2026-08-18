"""
Runtime configuration from environment variables.

Local dev: defaults keep the app working with no env vars set.
Production (Railway): set DATA_DIR, API_KEY, and optionally ALLOWED_ORIGINS.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Persistent data directory — use a Railway volume mount path in production.
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "user_data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "charges.db"

# When set, all /api/* routes (except /api/health) require X-API-Key header.
API_KEY: str | None = os.getenv("API_KEY") or None

# Comma-separated list of allowed CORS origins. Empty = same-origin only in production.
_allowed = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS: list[str] = (
    [o.strip() for o in _allowed.split(",") if o.strip()]
    if _allowed
    else ["http://localhost:5173", "http://127.0.0.1:5173"]
)

# Disable Swagger UI in production unless explicitly enabled.
ENABLE_DOCS = os.getenv("ENABLE_DOCS", "").lower() in ("1", "true", "yes")

# Directory containing the built React app (set by Dockerfile).
STATIC_DIR = Path(__file__).resolve().parent / "static"
