from fastapi import APIRouter, Query

from db import get_connection
from models import BudgetUpdate
from services import analytics
from services import categories_store as cats

router = APIRouter(prefix="/api/budget", tags=["budget"])


@router.get("")
def get_budget():
    """
    Same response shape the frontend has always gotten from budget.json
    ({categories, income, history}) — categories and income now come from
    the database instead. `history` is kept for API-shape compatibility but
    was already unused (no endpoint ever wrote to it).
    """
    conn = get_connection()
    try:
        categories = cats.list_categories(conn)
        income = cats.get_manual_income(conn)
    finally:
        conn.close()
    return {"categories": categories, "income": income, "history": []}


@router.put("")
def update_budget(update: BudgetUpdate):
    """
    Upsert the category list / targets and the manual income override.
    Categories missing from the payload are left in place (never deleted
    here) — the "remove" action in the UI is an archive toggle, matching the
    behavior this endpoint has always had.
    """
    conn = get_connection()
    try:
        cats.upsert_categories(conn, [c.model_dump() for c in update.categories])
        cats.set_manual_income(conn, update.income)
        conn.commit()
    finally:
        conn.close()
    return get_budget()


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
    start_d, end_d = analytics.resolve_period(period, start, end)

    conn = get_connection()
    active_categories = cats.list_categories(conn, include_archived=False)
    manual_income = cats.get_manual_income(conn)

    spend = analytics.spend_by_category(conn, start_d, end_d)

    if period == "3month_avg":
        spend = {k: round(v / 3, 2) for k, v in spend.items()}

    results = []
    total_spent = 0.0
    total_target = 0.0
    for cat in active_categories:
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
