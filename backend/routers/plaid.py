"""
Plaid Link lifecycle: create Link tokens, exchange the public token Link
hands back for a stored access token, list/remove connected Items, and
trigger a sync (manually or via Plaid's webhook).

Every endpoint here 503s with a clear message if Plaid isn't configured
(config.PLAID_CONFIGURED), rather than failing with an opaque import error —
Ledger should keep working with manual/CSV entry for anyone who hasn't set
up Plaid yet.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from config import PLAID_CONFIGURED
from db import get_connection
from models import ExchangeTokenRequest, LinkTokenRequest
from services import plaid_client, plaid_sync
from services.crypto import decrypt_token, encrypt_token

router = APIRouter(prefix="/api/plaid", tags=["plaid"])


def _require_configured():
    if not PLAID_CONFIGURED:
        raise HTTPException(
            status_code=503,
            detail=(
                "Plaid isn't configured on this server yet. Set "
                "PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_TOKEN_ENCRYPTION_KEY."
            ),
        )


@router.post("/link-token")
def create_link_token(body: LinkTokenRequest):
    _require_configured()
    update_token = None
    if body.item_id:
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT access_token FROM plaid_items WHERE plaid_item_id = ?",
                (body.item_id,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        update_token = decrypt_token(row["access_token"])

    try:
        result = plaid_client.create_link_token(update_item_access_token=update_token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Plaid error: {exc}")
    return {"link_token": result["link_token"], "expiration": result.get("expiration")}


@router.post("/exchange-token")
def exchange_token(body: ExchangeTokenRequest):
    _require_configured()
    try:
        exchange = plaid_client.exchange_public_token(body.public_token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Plaid error: {exc}")

    access_token = exchange["access_token"]
    plaid_item_id = exchange["item_id"]
    now = datetime.now(timezone.utc).isoformat()

    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO plaid_items
              (plaid_item_id, institution_id, institution_name, access_token, status, created_at)
            VALUES (?, ?, ?, ?, 'good', ?)
            ON CONFLICT(plaid_item_id) DO UPDATE SET
              access_token = excluded.access_token, status = 'good', error_code = NULL, error_message = NULL
            """,
            (
                plaid_item_id,
                body.institution_id,
                body.institution_name,
                encrypt_token(access_token),
                now,
            ),
        )
        conn.commit()
        item = conn.execute(
            "SELECT * FROM plaid_items WHERE plaid_item_id = ?", (plaid_item_id,)
        ).fetchone()
        result = plaid_sync.sync_item(conn, item)
    finally:
        conn.close()

    return {"item_id": plaid_item_id, "institution_name": body.institution_name, "sync": result}


@router.get("/items")
def list_items():
    conn = get_connection()
    try:
        items = conn.execute(
            "SELECT id, plaid_item_id, institution_id, institution_name, status, "
            "error_code, error_message, created_at, last_synced_at FROM plaid_items "
            "ORDER BY created_at"
        ).fetchall()
        result = []
        for item in items:
            accounts = conn.execute(
                "SELECT id, name, mask, type, current_balance FROM accounts "
                "WHERE plaid_item_id = ? AND is_hidden = 0",
                (item["id"],),
            ).fetchall()
            result.append({**dict(item), "accounts": [dict(a) for a in accounts]})
    finally:
        conn.close()
    return {"items": result}


@router.delete("/items/{plaid_item_id}")
def remove_item(plaid_item_id: str):
    """
    Disconnect an Item: tell Plaid to release it, then remove it locally.
    Historical charges imported from this Item are kept (their account_id is
    cleared) rather than deleted — losing the connection shouldn't erase
    spending history.
    """
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM plaid_items WHERE plaid_item_id = ?", (plaid_item_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")

        try:
            plaid_client.remove_item(decrypt_token(row["access_token"]))
        except Exception:
            # Still remove locally even if Plaid's side fails (e.g. already
            # revoked by the institution) — don't strand a dead connection.
            pass

        conn.execute(
            "UPDATE charges SET account_id = NULL WHERE account_id IN "
            "(SELECT id FROM accounts WHERE plaid_item_id = ?)",
            (row["id"],),
        )
        conn.execute("DELETE FROM accounts WHERE plaid_item_id = ?", (row["id"],))
        conn.execute("DELETE FROM plaid_items WHERE id = ?", (row["id"],))
        conn.commit()
    finally:
        conn.close()
    return {"removed": True, "item_id": plaid_item_id}


@router.post("/sync")
def trigger_sync(item_id: str | None = None):
    _require_configured()
    conn = get_connection()
    try:
        if item_id:
            item = conn.execute(
                "SELECT * FROM plaid_items WHERE plaid_item_id = ?", (item_id,)
            ).fetchone()
            if not item:
                raise HTTPException(status_code=404, detail="Item not found")
            results = [plaid_sync.sync_item(conn, item)]
        else:
            results = plaid_sync.sync_all_items(conn)
    finally:
        conn.close()
    return {"results": results}


@router.post("/webhook")
async def plaid_webhook(request: Request):
    """
    Plaid pushes events here (SYNC_UPDATES_AVAILABLE, item errors like
    ITEM_LOGIN_REQUIRED, etc). We don't gate this behind the app's X-API-Key
    (Plaid can't send it), so this is intentionally the one endpoint that
    trusts an unauthenticated POST — see PLAID_INTEGRATION_PLAN.md §6 on
    verifying Plaid's webhook JWT signature as a hardening follow-up before
    relying on this in place of the scheduled sync.
    """
    if not PLAID_CONFIGURED:
        return {"ignored": True}

    payload = await request.json()
    plaid_item_id = payload.get("item_id")
    webhook_type = payload.get("webhook_type")
    if not plaid_item_id:
        return {"ignored": True, "reason": "no item_id in payload"}

    conn = get_connection()
    try:
        item = conn.execute(
            "SELECT * FROM plaid_items WHERE plaid_item_id = ?", (plaid_item_id,)
        ).fetchone()
        if not item:
            return {"ignored": True, "reason": "unknown item_id"}
        result = plaid_sync.sync_item(conn, item)
    finally:
        conn.close()
    return {"handled": True, "webhook_type": webhook_type, "result": result}
