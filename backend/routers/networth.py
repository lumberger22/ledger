"""
Net worth = assets (checking/savings/investment/retirement balances) minus
liabilities (credit card/loan balances owed), across every connected and
manual account. This is new functionality — Ledger never tracked balances
before Plaid — see PLAID_INTEGRATION_PLAN.md §11.
"""

from datetime import datetime, timezone

from fastapi import APIRouter

from db import get_connection
from services import balance_history

router = APIRouter(prefix="/api/networth", tags=["networth"])

ASSET_TYPES = {"depository", "investment", "other"}
LIABILITY_TYPES = {"credit", "loan"}


@router.get("")
def get_networth():
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT a.*, pi.institution_name AS institution_name
            FROM accounts a
            LEFT JOIN plaid_items pi ON pi.id = a.plaid_item_id
            WHERE a.is_hidden = 0
            """
        ).fetchall()
    finally:
        conn.close()

    assets, liabilities = [], []
    for r in rows:
        d = dict(r)
        d["is_manual"] = bool(d["is_manual"])
        balance = d["current_balance"] or 0.0
        entry = {
            "id": d["id"],
            "name": d["name"],
            "institution_name": d["institution_name"],
            "type": d["type"],
            "subtype": d["subtype"],
            "mask": d["mask"],
            "balance": round(balance, 2),
            "is_manual": d["is_manual"],
        }
        if (d["type"] or "depository") in LIABILITY_TYPES:
            liabilities.append(entry)
        else:
            assets.append(entry)

    def by_type(entries):
        totals: dict = {}
        for e in entries:
            totals.setdefault(e["type"] or "other", 0.0)
            totals[e["type"] or "other"] += e["balance"]
        return [{"type": t, "total": round(v, 2)} for t, v in totals.items()]

    total_assets = round(sum(e["balance"] for e in assets), 2)
    total_liabilities = round(sum(e["balance"] for e in liabilities), 2)

    return {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "net_worth": round(total_assets - total_liabilities, 2),
        "assets": {"total": total_assets, "by_type": by_type(assets), "accounts": assets},
        "liabilities": {
            "total": total_liabilities,
            "by_type": by_type(liabilities),
            "accounts": liabilities,
        },
    }


@router.get("/history")
def get_networth_history(days: int = 180):
    """
    Net worth over time, built from Ledger's own daily balance snapshots
    (see services/balance_history.py) rather than anything Plaid provides
    directly — starts as a single point on the day an account was first
    connected/synced and fills in from there.
    """
    conn = get_connection()
    try:
        assets = balance_history.totals_by_date(conn, ASSET_TYPES, days)
        liabilities = balance_history.totals_by_date(conn, LIABILITY_TYPES, days)
    finally:
        conn.close()

    assets_by_date = {r["date"]: r["total"] for r in assets}
    liabilities_by_date = {r["date"]: r["total"] for r in liabilities}
    all_dates = sorted(set(assets_by_date) | set(liabilities_by_date))

    history = [
        {
            "date": d,
            "assets": assets_by_date.get(d, 0.0),
            "liabilities": liabilities_by_date.get(d, 0.0),
            "net_worth": round(assets_by_date.get(d, 0.0) - liabilities_by_date.get(d, 0.0), 2),
        }
        for d in all_dates
    ]
    return {"history": history}
