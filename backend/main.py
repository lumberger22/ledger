from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from routers import upload, pending, charges, budget, analysis, dashboard, settings

app = FastAPI(title="Local Budget App", version="1.0.0")

# Local-only app, no auth - frontend runs on Vite's dev server port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


# Also initialize eagerly at import time so the DB/tables exist even if
# something imports `app` without going through the ASGI startup lifecycle
# (e.g. certain test runners or WSGI-style bootstrapping).
init_db()


app.include_router(upload.router)
app.include_router(pending.router)
app.include_router(charges.router)
app.include_router(budget.router)
app.include_router(analysis.router)
app.include_router(dashboard.router)
app.include_router(settings.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
