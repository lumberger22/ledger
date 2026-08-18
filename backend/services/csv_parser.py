"""
Column-mapping-aware CSV -> row extraction.

Handles:
- Custom column names per settings.json's csv_column_mapping (credit card)
  or checking_csv_column_mapping (checking account) - caller picks which
  mapping to pass in based on the account type selected at upload time.
- Pending/hold charges where amount/description may be slightly malformed
  (skip only truly unparseable rows, never hard-crash the whole upload)
- Positive amounts (deposits, payments, credits/refunds) are intentionally
  ignored for both account types - this app only tracks spend.
- Sign convention: negative amount = spend/withdrawal, which is what we
  keep; positive = money in, which we drop during parsing.
"""

import io
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Tuple

import pandas as pd


class CsvParseError(Exception):
    pass


def parse_csv(
    file_bytes: bytes, column_mapping: Dict[str, str]
) -> Tuple[List[dict], str, List[str], int]:
    """
    Parse CSV bytes into a list of row dicts ready for insertion.

    Returns (rows, batch_id, warnings, skipped_positive_count)
    """
    try:
        df = pd.read_csv(io.BytesIO(file_bytes), dtype=str, keep_default_na=False)
    except Exception as e:
        raise CsvParseError(f"Could not read CSV: {e}")

    df.columns = [c.strip() for c in df.columns]

    date_col = column_mapping.get("date", "DATE")
    amount_col = column_mapping.get("amount", "AMOUNT")
    desc_col = column_mapping.get("description", "DESCRIPTION")

    missing = [c for c in (date_col, amount_col, desc_col) if c not in df.columns]
    if missing:
        raise CsvParseError(
            f"CSV is missing expected column(s): {', '.join(missing)}. "
            f"Found columns: {', '.join(df.columns)}. "
            "Update the CSV column mapping in Settings if your bank's export "
            "uses different header names."
        )

    batch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    rows: List[dict] = []
    warnings: List[str] = []
    skipped_positive = 0

    for idx, raw in df.iterrows():
        raw_date = str(raw.get(date_col, "")).strip()
        raw_amount = str(raw.get(amount_col, "")).strip()
        raw_desc = str(raw.get(desc_col, "")).strip()

        # Skip fully blank rows (trailing blank lines in exports).
        if not raw_date and not raw_amount and not raw_desc:
            continue

        parsed_date = _normalize_date(raw_date)
        if parsed_date is None:
            warnings.append(
                f"Row {idx + 2}: could not parse date '{raw_date}', skipped."
            )
            continue

        parsed_amount = _normalize_amount(raw_amount)
        if parsed_amount is None:
            # Pending/hold charges sometimes show amounts like "$1.00 (Pending)"
            # or blank until they finalize. Don't error the whole upload -
            # just flag it and skip that one row.
            warnings.append(
                f"Row {idx + 2}: could not parse amount '{raw_amount}' "
                "(possibly a pending/hold charge), skipped."
            )
            continue

        if parsed_amount > 0:
            # Deposits, payments, credits/refunds - not tracked by this app.
            skipped_positive += 1
            continue

        source = raw_desc if raw_desc else "(no description)"

        rows.append(
            {
                "date": parsed_date,
                "amount": parsed_amount,
                "source": source,
                "nickname": None,
                "category_id": None,
                "recurring": 0,
                "notes": None,
                "status": "pending",
                "upload_batch_id": batch_id,
                "source_file": None,
                "created_at": now,
                "updated_at": now,
            }
        )

    if not rows:
        if skipped_positive:
            raise CsvParseError(
                f"No spend found in this CSV — all {skipped_positive} row(s) were positive amounts "
                "(deposits/payments), which this app ignores."
            )
        raise CsvParseError("No usable rows found in this CSV.")

    return rows, batch_id, warnings, skipped_positive


def _normalize_date(raw: str) -> str | None:
    if not raw:
        return None
    fmts = ["%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y", "%m/%d/%y", "%d/%m/%Y"]
    for fmt in fmts:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    # Last resort: let pandas try to infer it.
    try:
        return pd.to_datetime(raw).date().isoformat()
    except Exception:
        return None


def _normalize_amount(raw: str) -> float | None:
    if not raw:
        return None
    cleaned = raw.replace("$", "").replace(",", "").strip()
    # Handle common "pending" annotations gracefully.
    cleaned = cleaned.replace("(Pending)", "").replace("Pending", "").strip()
    # Parenthesized negative numbers, e.g. "(45.00)"
    negative = False
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = cleaned[1:-1]
        negative = True
    if not cleaned:
        return None
    try:
        value = float(cleaned)
        return -value if negative else value
    except ValueError:
        return None
