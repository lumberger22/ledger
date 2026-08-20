"""
Investment holdings/allocation/gain-loss snapshot and value-over-time trend
for every connected investment-type account (brokerage, 401k, 403b, IRA,
etc). Holdings data comes from Plaid's Investments product, synced into
`investment_holdings` by services/plaid_sync.py; the trend comes from
Ledger's own daily balance snapshots (services/balance_history.py), since
Plaid never exposes retroactive balance history.
"""

from fastapi import APIRouter

from db import get_connection
from services import balance_history

router = APIRouter(prefix="/api/investments", tags=["investments"])


@router.get("/summary")
def get_investments_summary():
    conn = get_connection()
    try:
        account_rows = conn.execute(
            """
            SELECT a.*, pi.institution_name AS institution_name
            FROM accounts a
            LEFT JOIN plaid_items pi ON pi.id = a.plaid_item_id
            WHERE a.type = 'investment' AND a.is_hidden = 0
            ORDER BY pi.institution_name, a.name
            """
        ).fetchall()

        holdings_by_account: dict = {}
        account_ids = [r["id"] for r in account_rows]
        if account_ids:
            placeholders = ",".join("?" for _ in account_ids)
            holding_rows = conn.execute(
                f"""
                SELECT * FROM investment_holdings
                WHERE account_id IN ({placeholders})
                ORDER BY value DESC
                """,
                account_ids,
            ).fetchall()
            for hr in holding_rows:
                holdings_by_account.setdefault(hr["account_id"], []).append(dict(hr))
    finally:
        conn.close()

    accounts_out = []
    allocation: dict = {}
    total_value = 0.0
    total_cost_basis = 0.0
    has_cost_basis = False

    for row in account_rows:
        a = dict(row)
        holdings = holdings_by_account.get(a["id"], [])
        account_value = 0.0
        account_cost_basis = 0.0
        account_has_cost_basis = False
        holdings_out = []

        for h in holdings:
            value = h["value"] or 0.0
            cost_basis = h["cost_basis"]
            gain = (value - cost_basis) if cost_basis is not None else None
            gain_pct = (
                round(gain / cost_basis * 100, 2)
                if (cost_basis not in (None, 0) and gain is not None)
                else None
            )
            account_value += value
            if cost_basis is not None:
                account_cost_basis += cost_basis
                account_has_cost_basis = True

            sec_type = h["security_type"] or "other"
            allocation[sec_type] = allocation.get(sec_type, 0.0) + value

            holdings_out.append(
                {
                    "ticker": h["ticker"],
                    "name": h["name"],
                    "type": sec_type,
                    "quantity": h["quantity"],
                    "price": h["price"],
                    "value": round(value, 2),
                    "cost_basis": cost_basis,
                    "gain": round(gain, 2) if gain is not None else None,
                    "gain_pct": gain_pct,
                    "as_of_date": h["as_of_date"],
                }
            )

        total_value += account_value
        if account_has_cost_basis:
            total_cost_basis += account_cost_basis
            has_cost_basis = True

        accounts_out.append(
            {
                "id": a["id"],
                "name": a["name"],
                "institution_name": a["institution_name"],
                "mask": a["mask"],
                "subtype": a["subtype"],
                "current_balance": a["current_balance"],
                "holdings_value": round(account_value, 2),
                "cost_basis": round(account_cost_basis, 2) if account_has_cost_basis else None,
                "gain": round(account_value - account_cost_basis, 2)
                if account_has_cost_basis
                else None,
                "holdings": holdings_out,
            }
        )

    allocation_out = [
        {"type": t, "value": round(v, 2)}
        for t, v in sorted(allocation.items(), key=lambda kv: -kv[1])
    ]

    return {
        "total_value": round(total_value, 2),
        "total_cost_basis": round(total_cost_basis, 2) if has_cost_basis else None,
        "total_gain": round(total_value - total_cost_basis, 2) if has_cost_basis else None,
        "total_gain_pct": (
            round((total_value - total_cost_basis) / total_cost_basis * 100, 2)
            if (has_cost_basis and total_cost_basis)
            else None
        ),
        "allocation": allocation_out,
        "accounts": accounts_out,
    }


@router.get("/history")
def get_investments_history(days: int = 180):
    """Combined value over time across every connected investment account —
    see services/balance_history.py for how the trend is built and its
    forward-fill behavior."""
    conn = get_connection()
    try:
        totals = balance_history.totals_by_date(conn, {"investment"}, days)
    finally:
        conn.close()
    return {"history": [{"date": r["date"], "value": r["total"]} for r in totals]}
