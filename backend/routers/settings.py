import io
import os
import shutil
import tempfile
import zipfile
import zlib
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from config import DATA_DIR, MAX_BACKUP_EXPANDED_BYTES, MAX_BACKUP_UPLOAD_BYTES
from db import DB_PATH, get_connection, init_db
from models import Settings
from services.json_store import read_json, write_json
from services.upload_limits import read_upload_within_limit

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
async def restore_backup(request: Request, file: UploadFile = File(...)):
    """Restore data from a backup zip (same format as /backup download)."""
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Upload a .zip backup file.")

    content = await read_upload_within_limit(
        request, file, MAX_BACKUP_UPLOAD_BYTES
    )
    staging_dir = None
    restored: list[str] = []

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            entries = zf.infolist()
            if len(entries) > 32:
                raise HTTPException(status_code=400, detail="Backup has too many entries.")

            selected = {}
            expanded_size = 0
            for entry in entries:
                name = entry.filename
                if entry.is_dir() or name.startswith("__MACOSX/"):
                    continue
                basename = Path(name).name
                if basename not in ALLOWED_BACKUP_FILES:
                    continue
                if name != basename or basename in selected or entry.flag_bits & 0x1:
                    raise HTTPException(status_code=400, detail="Invalid backup archive.")
                if entry.file_size < 0:
                    raise HTTPException(status_code=400, detail="Invalid backup archive.")
                expanded_size += entry.file_size
                if expanded_size > MAX_BACKUP_EXPANDED_BYTES:
                    raise HTTPException(
                        status_code=413, detail="Backup expands beyond the allowed size."
                    )
                selected[basename] = entry

            if not selected:
                raise HTTPException(
                    status_code=400, detail="Backup contains no supported files."
                )

            # Extract to a private staging directory first so a truncated or
            # corrupt archive cannot leave a partially-written live backup.
            staging_dir = Path(tempfile.mkdtemp(prefix=".restore-", dir=DATA_DIR))
            for basename, entry in selected.items():
                staged_file = staging_dir / basename
                copied = 0
                with zf.open(entry) as src, open(staged_file, "wb") as dst:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        copied += len(chunk)
                        if copied > entry.file_size:
                            raise HTTPException(
                                status_code=400, detail="Invalid backup archive."
                            )
                        dst.write(chunk)
                if copied != entry.file_size:
                    raise HTTPException(status_code=400, detail="Invalid backup archive.")
                restored.append(basename)

        for basename in restored:
            os.replace(staging_dir / basename, DATA_DIR / basename)
    except HTTPException:
        raise
    except (zipfile.BadZipFile, OSError, RuntimeError, EOFError, zlib.error) as exc:
        raise HTTPException(status_code=400, detail="Invalid backup archive.") from exc
    finally:
        if staging_dir is not None:
            shutil.rmtree(staging_dir, ignore_errors=True)

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
