import io
import zipfile
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from db import USER_DATA_DIR, DB_PATH, get_connection, init_db
from models import Settings
from services.json_store import read_json, write_json

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_PATH = USER_DATA_DIR / "settings.json"

DEFAULT_SETTINGS = {
    "data_folder": str(USER_DATA_DIR),
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
            p = USER_DATA_DIR / name
            if p.exists():
                zf.write(p, arcname=name)
    buffer.seek(0)
    headers = {"Content-Disposition": "attachment; filename=budget-app-backup.zip"}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)


@router.post("/reset")
def reset_all_data(confirm: bool = False):
    """Danger zone: wipe all charges and reset budget/settings to defaults."""
    if not confirm:
        return {"reset": False, "message": "Pass confirm=true to actually reset all data."}

    conn = get_connection()
    try:
        conn.execute("DELETE FROM charges")
        conn.commit()
    finally:
        conn.close()

    write_json(USER_DATA_DIR / "budget.json", {"categories": [], "history": [], "income": None})
    write_json(SETTINGS_PATH, DEFAULT_SETTINGS)

    init_db()
    return {"reset": True}
