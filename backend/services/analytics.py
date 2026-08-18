"""
Shared aggregation/query logic used by budget.py, analysis.py, and dashboard.py.
"""

import calendar
import sqlite3
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple


def resolve_period(
    period: str, start: Optional[str] = None, end: Optional[str] = None
) -> Tuple[str, str]:
    """
    Turn a named period (or explicit range) into an ISO (start, end) date tuple.

    Supported named periods: 30d, this_month, last_month, ytd, 3month_avg
    (3month_avg resolves to the 3 full calendar months up to and including
    the current month - callers doing a true average should use
    three_month_window() instead).
    """
    today = date.today()

    if period == "custom" and start and end:
        return start, end

    if period == "30d":
        return (today - timedelta(days=30)).isoformat(), today.isoformat()

    if period == "this_month":
        first = today.replace(day=1)
        return first.isoformat(), today.isoformat()

    if period == "last_month":
        first_this_month = today.replace(day=1)
        last_day_prev_month = first_this_month - timedelta(days=1)
        first_prev_month = last_day_prev_month.replace(day=1)
        return first_prev_month.isoformat(), last_day_prev_month.isoformat()

    if period == "ytd":
        return date(today.year, 1, 1).isoformat(), today.isoformat()

    if period == "3month_avg":
        start_d, _ = three_month_window(today)
        return start_d.isoformat(), today.isoformat()

    # Fallback: this month.
    first = today.replace(day=1)
    return first.isoformat(), today.isoformat()


def three_month_window(anchor: date) -> Tuple[date, date]:
    """Return the start/end date spanning the current + previous 2 calendar months."""
    year = anchor.year
    month = anchor.month - 2
    while month <= 0:
        month += 12
        year -= 1
    start = date(year, month, 1)
    return start, anchor


def days_in_month(d: date) -> int:
    return calendar.monthrange(d.year, d.month)[1]


def spend_by_category(
    conn: sqlite3.Connection, start: str, end: str
) -> Dict[str, float]:
    """Return {category_id: total_spend} for confirmed charges (negative amounts = spend)."""
    rows = conn.execute(
        """
        SELECT category_id, SUM(-amount) as spend
        FROM charges
        WHERE status = 'confirmed' AND date >= ? AND date <= ? AND amount < 0
        GROUP BY category_id
        """,
        (start, end),
    ).fetchall()
    return {
        (r["category_id"] or "uncategorized"): round(r["spend"] or 0, 2) for r in rows
    }


def spend_by_merchant(
    conn: sqlite3.Connection, start: str, end: str, limit: int = 15
) -> List[dict]:
    rows = conn.execute(
        """
        SELECT source, amount
        FROM charges
        WHERE status = 'confirmed' AND date >= ? AND date <= ? AND amount < 0
        """,
        (start, end),
    ).fetchall()

    def merchant_key(source: str) -> str:
        source = source.removeprefix("TST*").strip()
        parts = source.split(" ", 2)

        return " ".join(parts[:2])

    grouped: dict = {}
    for r in rows:
        key = merchant_key(r["source"])
        entry = grouped.setdefault(key, {"total": 0.0, "count": 0})
        entry["total"] += -r["amount"]
        entry["count"] += 1

    results = [
        {"source": key, "total": round(vals["total"], 2), "count": vals["count"]}
        for key, vals in grouped.items()
    ]
    results.sort(key=lambda x: x["total"], reverse=True)
    return results[:limit]


def spend_by_month(conn: sqlite3.Connection, months_back: int = 6) -> List[dict]:
    """Monthly spend totals for the trailing N months, oldest first."""
    today = date.today()
    results = []
    y, m = today.year, today.month
    months = []
    for _ in range(months_back):
        months.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months.reverse()

    for yy, mm in months:
        start = date(yy, mm, 1).isoformat()
        end = date(yy, mm, days_in_month(date(yy, mm, 1))).isoformat()
        row = conn.execute(
            """
            SELECT SUM(-amount) as total
            FROM charges
            WHERE status = 'confirmed' AND date >= ? AND date <= ? AND amount < 0
            """,
            (start, end),
        ).fetchone()
        results.append(
            {
                "month": f"{yy:04d}-{mm:02d}",
                "total": round(row["total"] or 0, 2),
            }
        )
    return results


def recurring_split(conn: sqlite3.Connection, start: str, end: str) -> dict:
    row = conn.execute(
        """
        SELECT
          SUM(CASE WHEN recurring = 1 THEN -amount ELSE 0 END) as recurring_total,
          SUM(CASE WHEN recurring = 0 THEN -amount ELSE 0 END) as one_time_total
        FROM charges
        WHERE status = 'confirmed' AND date >= ? AND date <= ? AND amount < 0
        """,
        (start, end),
    ).fetchone()
    return {
        "recurring": round(row["recurring_total"] or 0, 2),
        "one_time": round(row["one_time_total"] or 0, 2),
    }


def pace_projection(
    conn: sqlite3.Connection, category_spend: Dict[str, float]
) -> Dict[str, dict]:
    """
    For the current, in-progress month: project full-month spend per category
    based on days elapsed so far.
    """
    today = date.today()
    day_of_month = today.day
    total_days = days_in_month(today)
    if day_of_month == 0:
        day_of_month = 1

    projections = {}
    for cat_id, spent in category_spend.items():
        per_day = spent / day_of_month
        projected = round(per_day * total_days, 2)
        projections[cat_id] = {
            "spent_so_far": spent,
            "per_day": round(per_day, 2),
            "projected_total": projected,
            "days_elapsed": day_of_month,
            "days_in_month": total_days,
        }
    return projections


def find_prior_categorizations(
    conn: sqlite3.Connection, sources: List[str]
) -> Dict[str, dict]:
    """
    For each given (raw) source string, find the most recent charge with that
    same source that already has a category assigned, and return its
    category_id + recurring flag. Used to prefill new uploads: if you've
    categorized "TST*ES VEDRA" before, new charges from the same merchant
    start pre-categorized (and inherit the recurring flag) instead of blank.

    Matching is case-insensitive and whitespace-trimmed, since bank exports
    are usually consistent per-merchant but not guaranteed to be identical
    byte-for-byte across statements.
    """
    if not sources:
        return {}

    results: Dict[str, dict] = {}
    seen_norm = set()
    for source in sources:
        norm = source.strip().lower()
        if norm in seen_norm:
            continue
        seen_norm.add(norm)

        row = conn.execute(
            """
            SELECT category_id, recurring
            FROM charges
            WHERE LOWER(TRIM(source)) = ? AND category_id IS NOT NULL
            ORDER BY date DESC, id DESC
            LIMIT 1
            """,
            (norm,),
        ).fetchone()
        if row:
            results[norm] = {
                "category_id": row["category_id"],
                "recurring": bool(row["recurring"]),
            }

    return results


def category_spend_by_month(conn, months_back=6):
    """Return per-category spending totals for trailing calendar months, oldest first."""
    today = date.today()
    months = []
    y, m = today.year, today.month
    for _ in range(months_back):
        months.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    months.reverse()
    results = []
    for yy, mm in months:
        start = date(yy, mm, 1).isoformat()
        end = date(yy, mm, days_in_month(date(yy, mm, 1))).isoformat()
        rows = conn.execute(
            """SELECT category_id, SUM(-amount) AS total
               FROM charges
               WHERE status = 'confirmed' AND date >= ? AND date <= ? AND amount < 0
               GROUP BY category_id""",
            (start, end),
        ).fetchall()
        results.append(
            {
                "month": f"{yy:04d}-{mm:02d}",
                "categories": {
                    (r["category_id"] or "uncategorized"): round(r["total"] or 0, 2)
                    for r in rows
                },
            }
        )
    return results


def spend_by_day_of_week(conn, start, end):
    """Return spending totals grouped by weekday for the requested period."""
    rows = conn.execute(
        """SELECT date, SUM(-amount) AS total
           FROM charges
           WHERE status = 'confirmed' AND date >= ? AND date <= ? AND amount < 0
           GROUP BY date ORDER BY date""",
        (start, end),
    ).fetchall()
    totals = {day: 0.0 for day in ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")}
    names = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    for row in rows:
        try:
            totals[names[date.fromisoformat(row["date"]).weekday()]] += (
                row["total"] or 0
            )
        except (TypeError, ValueError):
            continue
    return [{"day": day, "total": round(totals[day], 2)} for day in totals]


def biggest_charges(conn, start, end, limit=20):
    """Return the largest individual confirmed spending charges."""
    rows = conn.execute(
        """SELECT id, source, date, amount, category_id
           FROM charges
           WHERE status = 'confirmed' AND date >= ? AND date <= ? AND amount < 0
           ORDER BY ABS(amount) DESC, date DESC, id DESC LIMIT ?""",
        (start, end, limit),
    ).fetchall()
    return [
        {
            "id": str(r["id"]),
            "merchant": r["source"],
            "date": r["date"],
            "amount": round(-(r["amount"] or 0), 2),
            "category_id": r["category_id"],
        }
        for r in rows
    ]


def category_budget_variance_history(conn, categories, months_back=6):
    """Build six-month budget status history from monthly category budgets."""
    today = date.today()
    months = []
    y, m = today.year, today.month
    for _ in range(months_back):
        months.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    months.reverse()
    budget_by_id, meta_by_id = {}, {}
    for cat in categories:
        value = next(
            (
                cat.get(k)
                for k in ("budget", "monthly_budget", "budget_amount", "limit")
                if cat.get(k) is not None
            ),
            None,
        )
        try:
            value = float(value) if value is not None else None
        except (TypeError, ValueError):
            value = None
        if value is not None and value >= 0:
            budget_by_id[cat["id"]] = value
            meta_by_id[cat["id"]] = cat
    result = []
    for cat_id, budget in budget_by_id.items():
        statuses = []
        for yy, mm in months:
            start = date(yy, mm, 1).isoformat()
            end = date(yy, mm, days_in_month(date(yy, mm, 1))).isoformat()
            row = conn.execute(
                """SELECT SUM(-amount) AS total FROM charges
                   WHERE status = 'confirmed' AND date >= ? AND date <= ?
                     AND amount < 0 AND category_id = ?""",
                (start, end, cat_id),
            ).fetchone()
            spent = row["total"] or 0
            status = (
                "over" if spent > budget else "under" if spent < budget else "on_budget"
            )
            statuses.append({"month": f"{yy:04d}-{mm:02d}", "status": status})
        meta = meta_by_id[cat_id]
        result.append(
            {
                "category_id": cat_id,
                "name": meta.get("name", cat_id),
                "color": meta.get("color"),
                "months": statuses,
            }
        )
    return result
