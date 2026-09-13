"""
Shared pytest fixtures for the backend test suite.

DATA_DIR is redirected to a fresh temp directory *before* `config` (and
anything importing it) is loaded, so the test suite never touches the real
user_data/ directory or its charges.db. Per-test isolation on top of that
comes from the db_conn fixture below, which points db.DB_PATH at its own
tmp_path file and re-runs init_db() for a clean schema on every test.
"""

import os
import sys
import tempfile
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Must happen before any test module imports config/db/main — config.py
# computes DATA_DIR/DB_PATH at import time from this env var.
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="ledger-test-session-"))
os.environ.setdefault("API_KEY", "")
os.environ.setdefault("ALLOWED_ORIGINS", "")

import pytest  # noqa: E402

import db as db_module  # noqa: E402


@pytest.fixture()
def db_conn(tmp_path, monkeypatch):
    """
    A fresh, isolated SQLite connection with the full schema applied.

    Points db.DB_PATH (the module-global every get_connection() call reads)
    at a brand-new file under pytest's per-test tmp_path, so nothing a test
    writes can leak into another test or into the real database — and every
    router function under test that calls get_connection() internally picks
    up the same isolated file, since it's the same DB_PATH name they read.
    """
    test_db_path = tmp_path / "test.db"
    monkeypatch.setattr(db_module, "DB_PATH", test_db_path)
    db_module.init_db()
    conn = db_module.get_connection()
    yield conn
    conn.close()


@pytest.fixture()
def client(db_conn):
    """
    A FastAPI TestClient against the real app, for smoke-testing routes end
    to end (e.g. /api/health). Depends on db_conn purely to guarantee
    DB_PATH is already redirected to a throwaway file before `main` (which
    calls init_db() at import time) is imported.
    """
    from starlette.testclient import TestClient

    import main as main_module

    with TestClient(main_module.app) as c:
        yield c
