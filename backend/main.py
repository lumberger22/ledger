from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from auth import verify_api_key
from config import ALLOWED_ORIGINS, ENABLE_DOCS, STATIC_DIR
from db import init_db
from routers import upload, pending, charges, budget, analysis, dashboard, settings, income

app = FastAPI(
    title="Budget App",
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
    verify_api_key(request)
    return await call_next(request)


@app.on_event("startup")
def on_startup():
    init_db()


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
