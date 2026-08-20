from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query

from db import get_connection
from models import PendingUpdate

router = APIRouter(prefix="/api/pending", tags=["pending"])


def _row_to_dict(row):
    d = dict(row)
    d["recurring"] = bool(d["recurring"])
    return d


def _split_batch_ids(batch_id: str):
    """batch_id may be a single id or a comma-separated list (multi-file upload)."""
    return [b for b in (part.strip() for part in batch_id.split(",")) if b]


@router.get("")
def list_pending(
    batch_id: str = Query(
        ..., description="Single batch id, or comma-separated list of ids"
    )
):
    ids = _split_batch_ids(batch_id)
    if not ids:
        raise HTTPException(status_code=400, detail="No batch_id provided")

    placeholders = ",".join("?" for _ in ids)
    conn = get_connection()
    try:
        rows = conn.execute(
            f"SELECT * FROM charges WHERE status = 'pending' AND upload_batch_id IN ({placeholders}) ORDER BY date, id",
            ids,
        ).fetchall()
    finally:
        conn.close()
    items = [_row_to_dict(r) for r in rows]
    categorized = sum(1 for i in items if i["category_id"])
    return {"items": items, "total": len(items), "categorized": categorized}


@router.get("/plaid")
def list_pending_plaid():
    """
    Every pending charge synced from a connected account, across every
    Plaid Item, regardless of which sync batch it landed in. Plaid-synced
    transactions only auto-confirm straight into the budget when the
    merchant is already recognized (see services/plaid_sync.py) — anything
    new lands here instead of surfacing anywhere in the UI on its own, so
    this is the endpoint the "needs review" banner on Accounts/Charges uses
    to find them without the client having to track individual batch ids
    (one per Item, created/removed as items are connected/disconnected).
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM charges WHERE status = 'pending' AND source_type = 'plaid' "
            "ORDER BY date DESC, id DESC"
        ).fetchall()
    finally:
        conn.close()
    items = [_row_to_dict(r) for r in rows]
    categorized = sum(1 for i in items if i["category_id"])
    batch_ids = sorted({i["upload_batch_id"] for i in items if i["upload_batch_id"]})
    return {
        "items": items,
        "total": len(items),
        "categorized": categorized,
        "batch_ids": batch_ids,
    }


@router.put("/{charge_id}")
def update_pending(charge_id: int, update: PendingUpdate):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM charges WHERE id = ? AND status = 'pending'", (charge_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Pending charge not found")

        fields, values = [], []
        data = update.model_dump(exclude_unset=True)
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
def delete_pending(charge_id: int):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM charges WHERE id = ? AND status = 'pending'", (charge_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Pending charge not found")
        conn.execute("DELETE FROM charges WHERE id = ?", (charge_id,))
        conn.commit()
        return {"deleted": True, "id": charge_id}
    finally:
        conn.close()


@router.post("/confirm")
def confirm_batch(
    batch_id: str = Query(
        ..., description="Single batch id, or comma-separated list of ids"
    )
):
    ids = _split_batch_ids(batch_id)
    if not ids:
        raise HTTPException(status_code=400, detail="No batch_id provided")

    placeholders = ",".join("?" for _ in ids)
    conn = get_connection()
    try:
        rows = conn.execute(
            f"SELECT id, category_id FROM charges WHERE status = 'pending' AND upload_batch_id IN ({placeholders})",
            ids,
        ).fetchall()
        if not rows:
            raise HTTPException(
                status_code=404, detail="No pending rows found for this batch"
            )

        missing = [r["id"] for r in rows if not r["category_id"]]
        if missing:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Some rows are missing a category. Assign a category to every row before confirming.",
                    "missing_ids": missing,
                },
            )

        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            f"UPDATE charges SET status = 'confirmed', updated_at = ? WHERE status = 'pending' AND upload_batch_id IN ({placeholders})",
            [now] + ids,
        )
        conn.commit()
        return {"confirmed": len(rows), "batch_ids": ids}
    finally:
        conn.close()
