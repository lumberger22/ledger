from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from db import get_connection
from models import AccountUpdate, ManualAccountCreate
from services import balance_history

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def _row_to_dict(row) -> dict:
    d = dict(row)
    d["is_manual"] = bool(d["is_manual"])
    d["is_hidden"] = bool(d["is_hidden"])
    return d


@router.get("")
def list_accounts(include_hidden: bool = False):
    conn = get_connection()
    try:
        query = """
            SELECT a.*, pi.institution_name AS institution_name, pi.status AS item_status,
                   pi.plaid_item_id AS plaid_item_id
            FROM accounts a
            LEFT JOIN plaid_items pi ON pi.id = a.plaid_item_id
        """
        if not include_hidden:
            query += " WHERE a.is_hidden = 0"
        query += " ORDER BY a.is_manual, pi.institution_name, a.name"
        rows = conn.execute(query).fetchall()
    finally:
        conn.close()
    return {"accounts": [_row_to_dict(r) for r in rows]}


@router.post("")
def create_manual_account(body: ManualAccountCreate):
    """Manual accounts (e.g. cash, an institution Plaid doesn't cover) show
    up alongside connected ones on the Accounts/Net Worth views."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            INSERT INTO accounts
              (name, type, subtype, current_balance, iso_currency_code, is_manual,
               last_balance_sync_at, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (body.name, body.type, body.subtype, body.current_balance, body.iso_currency_code, now, now),
        )
        conn.commit()
        balance_history.record_snapshot(conn, cur.lastrowid, body.current_balance)
        conn.commit()
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (cur.lastrowid,)).fetchone()
    finally:
        conn.close()
    return _row_to_dict(row)


@router.put("/{account_id}")
def update_account(account_id: int, body: AccountUpdate):
    conn = get_connection()
    try:
        existing = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Account not found")

        data = body.model_dump(exclude_unset=True)
        if "current_balance" in data and not existing["is_manual"]:
            raise HTTPException(
                status_code=400,
                detail="Balance on a connected account is set by syncing with Plaid, not edited directly.",
            )
        if not data:
            return _row_to_dict(existing)

        fields, values = [], []
        for key, val in data.items():
            fields.append(f"{key} = ?")
            values.append(1 if (key == "is_hidden" and isinstance(val, bool)) else val)
        values.append(account_id)
        conn.execute(f"UPDATE accounts SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
        if "current_balance" in data:
            balance_history.record_snapshot(conn, account_id, data["current_balance"])
            conn.commit()
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    finally:
        conn.close()
    return _row_to_dict(row)


@router.delete("/{account_id}")
def delete_account(account_id: int):
    conn = get_connection()
    try:
        existing = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Account not found")
        if not existing["is_manual"]:
            raise HTTPException(
                status_code=400,
                detail="Disconnect this account's institution from the Accounts page instead of deleting it directly.",
            )
        conn.execute("UPDATE charges SET account_id = NULL WHERE account_id = ?", (account_id,))
        conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        conn.commit()
    finally:
        conn.close()
    return {"deleted": True, "id": account_id}
