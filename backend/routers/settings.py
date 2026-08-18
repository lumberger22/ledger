import io
import shutil
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import StreamingResponse

from config import DATA_DIR
from db import DB_PATH, get_connection, init_db
from models import Settings
from services.json_store import read_json, write_json

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_PATH = DATA_DIR / "settings.json"

DEFAULT_SETTINGS = {
    "data_folder": str(DATA_DIR),
    "currency": "USD",
    "date_format": "MM/DD/YYYY",
    "csv_column_mapping": {
        "date": "DATE",
        "amount": "AMOUNT",
        "description": "DESCRIPTION",
    },
    "checking_csv_column_mapping": {
        "date": "Date",
        "amount": "Amount",
        "description": "Description",
    },
    "theme": "light",
}


@router.get("")
def get_settings():
    return read_json(SETTINGS_PATH, DEFAULT_SETTINGS)


@router.put("")
def update_settings(settings: Settings):
    data = settings.model_dump()
    write_json(SETTINGS_PATH, data)
    return data


@router.get("/backup")
def download_backup():
    """One-click download of the SQLite file + all JSON files as a zip."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        if DB_PATH.exists():
            zf.write(DB_PATH, arcname="charges.db")
        for name in ("settings.json", "budget.json", "analysis_cache.json"):
            p = DATA_DIR / name
            if p.exists():
                zf.write(p, arcname=name)
    buffer.seek(0)
    headers = {"Content-Disposition": "attachment; filename=budget-app-backup.zip"}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)


ALLOWED_BACKUP_FILES = {
    "charges.db",
    "settings.json",
    "budget.json",
    "analysis_cache.json",
}


@router.post("/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Restore data from a backup zip (same format as /backup download)."""
    if not file.filename or not file.filename.lower().endswith(".zip"):
        return {"restored": False, "message": "Upload a .zip backup file."}

    content = await file.read()
    restored: list[str] = []

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for name in zf.namelist():
            # Ignore directories and macOS metadata.
            if name.endswith("/") or name.startswith("__MACOSX"):
                continue
            basename = Path(name).name
            if basename not in ALLOWED_BACKUP_FILES:
                continue
            dest = DATA_DIR / basename
            with zf.open(name) as src, open(dest, "wb") as dst:
                shutil.copyfileobj(src, dst)
            restored.append(basename)

    if "charges.db" in restored:
        init_db()

    return {"restored": True, "files": restored}


@router.post("/reset")
def reset_all_data(confirm: bool = False):
    """Danger zone: wipe all charges and reset budget/settings to defaults."""
    if not confirm:
        return {
            "reset": False,
            "message": "Pass confirm=true to actually reset all data.",
        }

    conn = get_connection()
    try:
        conn.execute("DELETE FROM charges")
        conn.commit()
    finally:
        conn.close()

    write_json(
        DATA_DIR / "budget.json", {"categories": [], "history": [], "income": None}
    )
    write_json(SETTINGS_PATH, DEFAULT_SETTINGS)

    init_db()
    return {"reset": True}
