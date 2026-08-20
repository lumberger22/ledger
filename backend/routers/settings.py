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
    """
    One-click download of the SQLite file + JSON config files as a zip.
    Categories, Plaid item/account records, and balances all live inside
    charges.db now, so this single file covers everything except the
    settings.json CSV mappings — note the db includes encrypted Plaid access
    tokens (see PLAID_TOKEN_ENCRYPTION_KEY), so treat this zip as sensitive.
    """
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
    """
    Danger zone: wipe all charges, categories, Plaid connections/accounts,
    and settings, resetting everything to defaults.
    """
    if not confirm:
        return {
            "reset": False,
            "message": "Pass confirm=true to actually reset all data.",
        }

    conn = get_connection()
    try:
        # Best-effort: tell Plaid to release each connected Item before we
        # forget its access token locally, so it doesn't keep counting
        # against the Trial plan's Item limit or sitting live at Plaid with
        # nothing local pointing at it. Never block the local reset on this.
        try:
            from services import plaid_client
            from services.crypto import decrypt_token

            for row in conn.execute("SELECT access_token FROM plaid_items"):
                try:
                    plaid_client.remove_item(decrypt_token(row["access_token"]))
                except Exception:
                    pass
        except Exception:
            pass

        conn.execute("DELETE FROM charges")
        conn.execute("DELETE FROM investment_holdings")
        conn.execute("DELETE FROM accounts")
        conn.execute("DELETE FROM plaid_items")
        conn.execute("DELETE FROM categories")
        conn.execute("DELETE FROM budget_meta")
        conn.commit()
    finally:
        conn.close()

    write_json(SETTINGS_PATH, DEFAULT_SETTINGS)

    init_db()
    return {"reset": True}
