import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.url.path != "/api/health":
        try:
            verify_api_key(request)
        except HTTPException as exc:
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
            )

    return await call_next(request)


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

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
