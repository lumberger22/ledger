from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from db import get_connection
from models import ChargeCreate, ChargeUpdate

router = APIRouter(prefix="/api/charges", tags=["charges"])

ALLOWED_SORT = {"date", "amount", "category_id", "source"}


def _row_to_dict(row):
    d = dict(row)
    d["recurring"] = bool(d["recurring"])
    return d


@router.get("")
def list_charges(
    start: Optional[str] = None,
    end: Optional[str] = None,
    category_id: Optional[str] = Query(
        None, description="Comma-separated list for multi-select"
    ),
    recurring_only: bool = False,
    search: Optional[str] = None,
    sort: str = Query("date"),
    direction: str = Query("desc"),
):
    clauses = ["status = 'confirmed'"]
    params = []

    if start:
        clauses.append("date >= ?")
        params.append(start)
    if end:
        clauses.append("date <= ?")
        params.append(end)
    if category_id:
        ids = [c for c in category_id.split(",") if c]
        if ids:
            placeholders = ",".join("?" for _ in ids)
            clauses.append(f"category_id IN ({placeholders})")
            params.extend(ids)
    if recurring_only:
        clauses.append("recurring = 1")
    if search:
        clauses.append("(source LIKE ? OR nickname LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like])

    sort_col = sort if sort in ALLOWED_SORT else "date"
    sort_dir = "ASC" if direction.lower() == "asc" else "DESC"

    query = f"""
        SELECT * FROM charges
        WHERE {' AND '.join(clauses)}
        ORDER BY {sort_col} {sort_dir}, id {sort_dir}
    """

    conn = get_connection()
    try:
        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()

    items = [_row_to_dict(r) for r in rows]
    total_amount = round(sum(i["amount"] for i in items), 2)
    return {"items": items, "total": len(items), "total_amount": total_amount}


@router.post("")
def create_charge(charge: ChargeCreate):
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            INSERT INTO charges
              (date, amount, source, nickname, category_id, recurring, notes,
               status, upload_batch_id, source_file, source_type, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'manual', 'manual', ?, ?)
            """,
            (
                charge.date,
                charge.amount,
                charge.source,
                charge.nickname,
                charge.category_id,
                1 if charge.recurring else 0,
                charge.notes,
                charge.status,
                now,
                now,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM charges WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


@router.put("/{charge_id}")
def update_charge(charge_id: int, update: ChargeUpdate):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM charges WHERE id = ?", (charge_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Charge not found")

        data = update.model_dump(exclude_unset=True)
        if not data:
            row = conn.execute(
                "SELECT * FROM charges WHERE id = ?", (charge_id,)
            ).fetchone()
            return _row_to_dict(row)

        fields, values = [], []
        for key, val in data.items():
            if key == "recurring" and val is not None:
                val = 1 if val else 0
            fields.append(f"{key} = ?")
            values.append(val)
        fields.append("updated_at = ?")
        values.append(datetime.now(timezone.utc).isoformat())
        values.append(charge_id)

        conn.execute(f"UPDATE charges SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
        row = conn.execute(
            "SELECT * FROM charges WHERE id = ?", (charge_id,)
        ).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


@router.delete("/{charge_id}")
def delete_charge(charge_id: int):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM charges WHERE id = ?", (charge_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Charge not found")
        conn.execute("DELETE FROM charges WHERE id = ?", (charge_id,))
        conn.commit()
        return {"deleted": True, "id": charge_id}
    finally:
        conn.close()
