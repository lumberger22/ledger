"""
Runtime configuration from environment variables.

Local dev: copy .env.example to .env at the repo root and fill it in —
load_dotenv() below reads it automatically, so plain `uvicorn main:app` (or
run.bat/run.sh, which don't do any env-loading themselves) picks it up. Env
vars set directly in the shell/process always win over .env (override=False),
so this is also safe as a no-op in production: EC2 sets real environment
variables directly and there's no .env file shipped in the Docker image.
Local dev: defaults keep the app working with no env vars set (Plaid stays
disabled until PLAID_CLIENT_ID/PLAID_SECRET are set).
Production (EC2): set DATA_DIR, API_KEY, ALLOWED_ORIGINS, and the PLAID_*
variables below.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Persistent data directory — points at the EC2 host's data volume in production.
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

# ---------- Plaid ----------

PLAID_CLIENT_ID: str | None = os.getenv("PLAID_CLIENT_ID") or None
PLAID_SECRET: str | None = os.getenv("PLAID_SECRET") or None
# "sandbox" while developing/testing, "production" once linking real accounts.
PLAID_ENV: str = os.getenv("PLAID_ENV", "sandbox")
# Fernet key (44-char urlsafe-base64 string from `Fernet.generate_key()`) used
# to encrypt Plaid access tokens at rest. Required before any Plaid item can
# be linked — see services/crypto.py.
PLAID_TOKEN_ENCRYPTION_KEY: str | None = os.getenv("PLAID_TOKEN_ENCRYPTION_KEY") or None
# Public HTTPS URL Plaid should POST webhooks to, e.g. https://lucasledger.uk/api/plaid/webhook.
# Optional in sandbox; without it you rely on scheduled/manual sync instead of push updates.
PLAID_WEBHOOK_URL: str | None = os.getenv("PLAID_WEBHOOK_URL") or None
# OAuth redirect URI — required for OAuth institutions (Wells Fargo, Chase,
# and most large banks) to work reliably on mobile/mobile-web/installed PWAs.
# Must exactly match (protocol, host, path — no query string) an entry in
# the Plaid Dashboard's "Allowed redirect URIs" list for the current
# environment (Sandbox vs Production have separate lists there). Ledger
# reuses its own Accounts page as the landing target, e.g.
# https://lucasledger.uk/accounts — see README's OAuth section. Optional:
# without it, OAuth still works via popup on desktop browsers, but is
# unreliable or broken inside an installed home-screen web app on iOS.
PLAID_REDIRECT_URI: str | None = os.getenv("PLAID_REDIRECT_URI") or None
# How often the background scheduler refreshes all connected items, in minutes.
PLAID_SYNC_INTERVAL_MINUTES: int = int(os.getenv("PLAID_SYNC_INTERVAL_MINUTES", "180"))

PLAID_CONFIGURED: bool = bool(PLAID_CLIENT_ID and PLAID_SECRET and PLAID_TOKEN_ENCRYPTION_KEY)
