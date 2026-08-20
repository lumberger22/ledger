from datetime import datetime, timezone
from fastapi import APIRouter, Query

from config import DATA_DIR
from db import get_connection
from models import BudgetUpdate
from services.json_store import read_json, write_json
from services import analytics

router = APIRouter(prefix="/api/budget", tags=["budget"])

BUDGET_PATH = DATA_DIR / "budget.json"

DEFAULT_BUDGET = {"categories": [], "history": [], "income": None}


@router.get("")
def get_budget():
    return read_json(BUDGET_PATH, DEFAULT_BUDGET)


@router.put("")
def update_budget(update: BudgetUpdate):
    """
    Replace the single global category list / targets. This budget applies
    uniformly regardless of period — the period filter only changes which
    confirmed charges get summed against it (see /status below), not which
    targets are in effect.
    """
    current = read_json(BUDGET_PATH, DEFAULT_BUDGET)
    current_by_id = {c["id"]: c for c in current.get("categories", [])}

    new_categories = [c.model_dump() for c in update.categories]
    for c in new_categories:
        if not c.get("created_at"):
            prev = current_by_id.get(c["id"])
            c["created_at"] = (
                prev.get("created_at")
                if prev
                else datetime.now(timezone.utc).isoformat()
            )

    data = {
        "categories": new_categories,
        "history": current.get("history", []),
        "income": update.income,
    }
    write_json(BUDGET_PATH, data)
    return data


@router.get("/status")
def budget_status(
    period: str = Query("this_month"), start: str = Query(None), end: str = Query(None)
):
    """
    Spend vs. target per category for a period. There is only one budget
    (one set of categories/targets) - the period only controls which
    confirmed charges get summed. For "3month_avg", the 3-month total is
    divided by 3 so it's comparable to the (single, monthly) target.
    """
    budget = read_json(BUDGET_PATH, DEFAULT_BUDGET)
    start_d, end_d = analytics.resolve_period(period, start, end)

    conn = get_connection()
    spend = analytics.spend_by_category(conn, start_d, end_d)

    if period == "3month_avg":
        spend = {k: round(v / 3, 2) for k, v in spend.items()}

    active_categories = budget.get("categories", [])

    results = []
    total_spent = 0.0
    total_target = 0.0
    for cat in active_categories:
        if cat.get("archived"):
            continue
        spent = spend.get(cat["id"], 0.0)
        target = cat.get("monthly_target", 0.0)
        total_spent += spent
        total_target += target
        pct = (spent / target * 100) if target else (100 if spent > 0 else 0)
        status = "on_track"
        if target and spent > target:
            status = "over"
        elif target and pct >= 85:
            status = "behind"
        results.append(
            {
                "id": cat["id"],
                "name": cat["name"],
                "color": cat.get("color"),
                "monthly_target": target,
                "spent": round(spent, 2),
                "percent": round(pct, 1),
                "status": status,
            }
        )

    uncategorized = spend.get("uncategorized", 0.0)

    manual_income = budget.get("income")
    effective_income = manual_income
    income_source = "manual" if manual_income is not None else "paystub"
    if effective_income is None:
        income_row = conn.execute(
            "SELECT COALESCE(SUM(net_pay), 0) AS net FROM paystubs WHERE check_date >= ? AND check_date <= ?",
            (start_d, end_d),
        ).fetchone()
        effective_income = round(income_row["net"] or 0, 2)
        if period == "3month_avg":
            effective_income = round(effective_income / 3, 2)

    conn.close()

    return {
        "period": {"start": start_d, "end": end_d},
        "categories": results,
        "uncategorized_spend": round(uncategorized, 2),
        "total_spent": round(total_spent + uncategorized, 2),
        "total_target": round(total_target, 2),
        "income": effective_income,
        "manual_income": manual_income,
        "income_source": income_source,
    }
