from datetime import datetime
from fastapi import APIRouter, Query

from db import get_connection
from services import analytics
from services import categories_store as cats

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("")
def get_analysis(
    period: str = Query("this_month"), start: str = Query(None), end: str = Query(None)
):
    start_d, end_d = analytics.resolve_period(period, start, end)

    conn = get_connection()
    try:
        names = cats.category_meta_map(conn)
        all_categories = cats.list_categories(conn)
        by_category = analytics.spend_by_category(conn, start_d, end_d)
        merchants = analytics.spend_by_merchant(conn, start_d, end_d, limit=500)
        monthly_trend = analytics.spend_by_month(conn, months_back=6)
        category_trend = analytics.category_spend_by_month(conn, months_back=6)
        day_of_week_breakdown = analytics.spend_by_day_of_week(conn, start_d, end_d)
        biggest = analytics.biggest_charges(conn, start_d, end_d, limit=20)
        recurring = analytics.recurring_split(conn, start_d, end_d)

        # Period comparisons
        this_month_start, this_month_end = analytics.resolve_period("this_month")
        last_month_start, last_month_end = analytics.resolve_period("last_month")
        three_month_start, three_month_end = analytics.resolve_period("3month_avg")

        this_month_total = sum(
            analytics.spend_by_category(conn, this_month_start, this_month_end).values()
        )
        last_month_total = sum(
            analytics.spend_by_category(conn, last_month_start, last_month_end).values()
        )
        three_month_total = sum(
            analytics.spend_by_category(
                conn, three_month_start, three_month_end
            ).values()
        )

        # Per-category month-over-month comparison.
        previous_by_category = analytics.spend_by_category(
            conn, last_month_start, last_month_end
        )
        category_breakdown = []
        for cat_id, amount in by_category.items():
            meta = names.get(
                cat_id,
                {
                    "name": "Uncategorized" if cat_id == "uncategorized" else cat_id,
                    "color": "#9CA3AF",
                },
            )
            category_breakdown.append(
                {
                    "category_id": cat_id,
                    "name": meta["name"],
                    "color": meta["color"],
                    "total": amount,
                    "amount": amount,
                    "previous_total": previous_by_category.get(cat_id),
                }
            )
        category_breakdown.sort(key=lambda x: x["total"], reverse=True)

        budget_variance_history = analytics.category_budget_variance_history(
            conn, all_categories, months_back=6
        )

        pace = {}
        today = datetime.now().date()
        if period in ("this_month", "30d") or (start_d <= today.isoformat() <= end_d):
            pace = analytics.pace_projection(conn=conn, category_spend=by_category)
    finally:
        conn.close()

    return {
        "period": {"start": start_d, "end": end_d},
        "category_breakdown": category_breakdown,
        "top_merchants": merchants,
        "monthly_trend": monthly_trend,
        "category_trend": category_trend,
        "day_of_week_breakdown": day_of_week_breakdown,
        "biggest_charges": biggest,
        "recurring_split": recurring,
        "pace_projection": pace,
        "budget_variance_history": budget_variance_history,
        "period_comparison": {
            "this_month": round(this_month_total, 2),
            "last_month": round(last_month_total, 2),
            "three_month_avg": round(three_month_total / 3, 2),
        },
    }
