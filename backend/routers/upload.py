from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request

from config import DATA_DIR, MAX_UPLOAD_BYTES
from db import get_connection
from services.csv_parser import parse_csv, CsvParseError
from services.json_store import read_json
from services.analytics import find_prior_categorizations
from services.upload_limits import read_upload_within_limit

router = APIRouter(prefix="/api/upload", tags=["upload"])

SETTINGS_PATH = DATA_DIR / "settings.json"
DEFAULT_CC_MAPPING = {"date": "DATE", "amount": "AMOUNT", "description": "DESCRIPTION"}
DEFAULT_CHECKING_MAPPING = {
    "date": "Date",
    "amount": "Amount",
    "description": "Description",
}
ACCOUNT_TYPES = {"credit_card", "checking"}


@router.post("")
async def upload_csv(
    request: Request,
    file: UploadFile = File(...),
    account_type: str = Form("credit_card"),
):
    """
    Upload + parse a single CSV -> pending rows. `account_type` determines
    which column mapping from settings.json is used ("credit_card" or
    "checking") - both produce identically-shaped charges once parsed, so
    everything downstream (categorization, budget, analysis) treats them
    the same. To import multiple files (e.g. one credit card + one checking
    export) at once, call this endpoint once per file from the client and
    combine the returned batch_ids into a single comma-separated batch_id
    when reviewing/confirming.
    """
    if account_type not in ACCOUNT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"account_type must be one of {sorted(ACCOUNT_TYPES)}",
        )

    settings = read_json(
        SETTINGS_PATH,
        {
            "csv_column_mapping": DEFAULT_CC_MAPPING,
            "checking_csv_column_mapping": DEFAULT_CHECKING_MAPPING,
        },
    )
    if account_type == "checking":
        mapping = settings.get("checking_csv_column_mapping", DEFAULT_CHECKING_MAPPING)
    else:
        mapping = settings.get("csv_column_mapping", DEFAULT_CC_MAPPING)

    contents = await read_upload_within_limit(request, file, MAX_UPLOAD_BYTES)
    try:
        rows, batch_id, warnings, skipped_positive = parse_csv(contents, mapping)
    except CsvParseError as e:
        raise HTTPException(status_code=400, detail=str(e))

    conn = get_connection()
    try:
        # Prefill category + recurring for rows whose merchant string matches
        # a charge we've already categorized before, so repeat merchants
        # don't need to be re-categorized every upload.
        prior = find_prior_categorizations(conn, [r["source"] for r in rows])
        prefilled_count = 0
        for row in rows:
            match = prior.get(row["source"].strip().lower())
            if match:
                row["category_id"] = match["category_id"]
                row["recurring"] = 1 if match["recurring"] else 0
                prefilled_count += 1

        for row in rows:
            row["source_file"] = file.filename
            row["account_type"] = account_type
            conn.execute(
                """
                INSERT INTO charges
                  (date, amount, source, nickname, category_id, recurring, notes,
                   status, upload_batch_id, source_file, account_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["date"],
                    row["amount"],
                    row["source"],
                    row["nickname"],
                    row["category_id"],
                    row["recurring"],
                    row["notes"],
                    row["status"],
                    row["upload_batch_id"],
                    row["source_file"],
                    row["account_type"],
                    row["created_at"],
                    row["updated_at"],
                ),
            )
        conn.commit()
    finally:
        conn.close()

    return {
        "batch_id": batch_id,
        "row_count": len(rows),
        "warnings": warnings,
        "filename": file.filename,
        "account_type": account_type,
        "prefilled_count": prefilled_count,
        "skipped_positive_count": skipped_positive,
    }
