import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from auth import verify_api_key
from config import ALLOWED_ORIGINS, ENABLE_DOCS, PLAID_CONFIGURED, PLAID_SYNC_INTERVAL_MINUTES, STATIC_DIR
from db import get_connection, init_db
from routers import (
    accounts,
    analysis,
    budget,
    charges,
    dashboard,
    income,
    investments,
    networth,
    pending,
    plaid,
    settings,
    upload,
)
from services.rate_limit import SlidingWindowLimiter, get_client_ip

logger = logging.getLogger("ledger")

app = FastAPI(
    title="Ledger",
    version="1.0.0",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.url.path != "/api/health":
        try:
            verify_api_key(request)
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers=exc.headers,
            )

    return await call_next(request)


# General per-IP throughput limit across /api/*, separate from and coarser
# than the auth-failure lockout in auth.py: this one blunts scraping,
# accidental client-side retry storms, and resource-exhaustion attempts
# regardless of whether requests carry a valid key, rather than specifically
# targeting password guessing. /api/health is exempt (cheap, may be polled
# by an uptime monitor); /api/plaid/webhook gets its own, more permissive
# counter since Plaid may legitimately fire several webhooks in quick
# succession (see SECURITY_HARDENING_PLAN.md SS2).
_api_limiter = SlidingWindowLimiter(max_events=180, window_seconds=60)
_webhook_limiter = SlidingWindowLimiter(max_events=30, window_seconds=60)
_RATE_LIMIT_EXEMPT_PATHS = {"/api/health"}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and path not in _RATE_LIMIT_EXEMPT_PATHS:
        ip = get_client_ip(request)
        limiter = _webhook_limiter if path == "/api/plaid/webhook" else _api_limiter
        allowed, retry_after = limiter.hit(ip)
        if not allowed:
            logger.warning("Rate limit exceeded for %s from %s", path, ip)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": str(int(retry_after))},
            )

    return await call_next(request)


# Security headers on every response, including the SPA's static files, not
# just the API -- see SECURITY_HARDENING_PLAN.md SS6. CSP starts in
# report-only mode: watch the browser console for violations for a while
# (Vite build, Plaid Link's iframe/popup, WebAuthn for Face ID quick-unlock)
# before flipping it to an enforcing Content-Security-Policy header.
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    response.headers["Content-Security-Policy-Report-Only"] = (
        "default-src 'self'; "
        "connect-src 'self' https://production.plaid.com https://sandbox.plaid.com; "
        "frame-src https://cdn.plaid.com; "
        "img-src 'self' data:; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "frame-ancestors 'none'"
    )
    return response


_scheduler = None


def _run_scheduled_sync():
    from services import plaid_sync

    conn = get_connection()
    try:
        results = plaid_sync.sync_all_items(conn)
        if results:
            logger.info("Plaid scheduled sync: %s", results)
    except Exception:  # noqa: BLE001 - a scheduled run must never crash the process
        logger.exception("Plaid scheduled sync failed")
    finally:
        conn.close()


@app.on_event("startup")
def on_startup():
    init_db()

    global _scheduler
    if PLAID_CONFIGURED and _scheduler is None:
        from apscheduler.schedulers.background import BackgroundScheduler

        _scheduler = BackgroundScheduler(daemon=True)
        # First run fires one interval from now (APScheduler's default for an
        # "interval" trigger) — not immediately on every restart. Use
        # POST /api/plaid/sync for an on-demand sync right away.
        _scheduler.add_job(
            _run_scheduled_sync,
            "interval",
            minutes=PLAID_SYNC_INTERVAL_MINUTES,
        )
        _scheduler.start()
        logger.info(
            "Plaid background sync scheduled every %s minutes", PLAID_SYNC_INTERVAL_MINUTES
        )


# Initialize eagerly so the DB/tables exist even without ASGI startup lifecycle.
init_db()

app.include_router(upload.router)
app.include_router(pending.router)
app.include_router(charges.router)
app.include_router(budget.router)
app.include_router(analysis.router)
app.include_router(dashboard.router)
app.include_router(settings.router)
app.include_router(income.router)
app.include_router(plaid.router)
app.include_router(accounts.router)
app.include_router(networth.router)
app.include_router(investments.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve the built React app in production (when static/ exists).
if STATIC_DIR.is_dir() and (STATIC_DIR / "index.html").is_file():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    _static_root = STATIC_DIR.resolve()

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        # Resolve symlinks/".." before deciding what to serve — full_path
        # comes straight from the URL, so without this a path like
        # "../../../etc/passwd" (or its %2e%2e-encoded form) would let a
        # request read arbitrary files off the host via simple string
        # joining. Anything that resolves outside STATIC_DIR falls back to
        # the SPA shell instead, same as any other unmatched client route.
        candidate = (STATIC_DIR / full_path).resolve()
        if candidate.is_relative_to(_static_root) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
