from datetime import datetime
from fastapi import APIRouter, Query

from config import DATA_DIR
from db import get_connection
from services import analytics
from services.json_store import read_json

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

BUDGET_PATH = DATA_DIR / "budget.json"
DEFAULT_BUDGET = {"categories": [], "history": [], "income": None}


@router.get("")
def get_dashboard(
    period: str = Query("this_month"), start: str = Query(None), end: str = Query(None)
):
    start_d, end_d = analytics.resolve_period(period, start, end)
    budget = read_json(BUDGET_PATH, DEFAULT_BUDGET)
    names = {
        c["id"]: {"name": c["name"], "color": c.get("color")}
        for c in budget.get("categories", [])
    }

    conn = get_connection()
    try:
        by_category = analytics.spend_by_category(conn, start_d, end_d)
        active_categories = budget.get("categories", [])

        total_target = sum(
            c.get("monthly_target", 0)
            for c in active_categories
            if not c.get("archived")
        )
        total_spent = sum(by_category.values())

        status = "on_track"
        if total_target and total_spent > total_target:
            status = "over"
        elif total_target and total_spent / total_target >= 0.85:
            status = "behind"

        breakdown = []
        for cat_id, amount in by_category.items():
            meta = names.get(
                cat_id,
                {
                    "name": "Uncategorized" if cat_id == "uncategorized" else cat_id,
                    "color": "#9CA3AF",
                },
            )
            breakdown.append(
                {
                    "category_id": cat_id,
                    "name": meta["name"],
                    "color": meta["color"],
                    "amount": amount,
                }
            )
        breakdown.sort(key=lambda x: x["amount"], reverse=True)
        top_categories = breakdown[:8]

        recent = conn.execute(
            "SELECT * FROM charges WHERE status = 'confirmed' ORDER BY date DESC, id DESC LIMIT 8"
        ).fetchall()
        recent_charges = []
        for r in recent:
            d = dict(r)
            d["recurring"] = bool(d["recurring"])
            recent_charges.append(d)

        has_any_confirmed = (
            conn.execute(
                "SELECT COUNT(*) as c FROM charges WHERE status = 'confirmed'"
            ).fetchone()["c"]
            > 0
        )
        income_row = conn.execute(
            "SELECT COALESCE(SUM(gross_pay), 0) AS gross, COALESCE(SUM(net_pay), 0) AS net, COALESCE(SUM(taxes_total), 0) AS taxes, COUNT(*) AS count FROM paystubs WHERE check_date >= ? AND check_date <= ?",
            (start_d, end_d),
        ).fetchone()
    finally:
        conn.close()

    return {
        "period": {"start": start_d, "end": end_d},
        "budget_summary": {
            "total_spent": round(total_spent, 2),
            "total_target": round(total_target, 2),
            "status": status,
        },
        "income_summary": {
            "gross": round(income_row["gross"] or 0, 2),
            "net": round(income_row["net"] or 0, 2),
            "taxes": round(income_row["taxes"] or 0, 2),
            "count": income_row["count"],
        },
        "has_income": income_row["count"] > 0,
        "top_categories": top_categories,
        "recent_charges": recent_charges,
        "has_data": has_any_confirmed,
    }
