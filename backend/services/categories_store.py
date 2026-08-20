"""
Shared read/write helpers for budget categories + the manual income override.

Categories used to live in budget.json; they're now rows in the `categories`
table (see db.py's migration), so every router that used to do
`read_json(BUDGET_PATH, ...)` for category names/colors/targets goes through
here instead. Keeping this in one place means budget.py, dashboard.py, and
analysis.py all see the same shape without duplicating the SQL.
"""

import sqlite3
from datetime import datetime, timezone
from typing import Dict, List, Optional


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "monthly_target": row["monthly_target"],
        "color": row["color"],
        "archived": bool(row["archived"]),
        "created_at": row["created_at"],
    }


def list_categories(conn: sqlite3.Connection, include_archived: bool = True) -> List[dict]:
    query = "SELECT * FROM categories"
    if not include_archived:
        query += " WHERE archived = 0"
    query += " ORDER BY sort_order, created_at"
    rows = conn.execute(query).fetchall()
    return [_row_to_dict(r) for r in rows]


def category_meta_map(conn: sqlite3.Connection) -> Dict[str, dict]:
    """{category_id: {"name": ..., "color": ...}} for quick lookups."""
    return {c["id"]: {"name": c["name"], "color": c["color"]} for c in list_categories(conn)}


def upsert_categories(conn: sqlite3.Connection, categories: List[dict]) -> None:
    """
    Insert/update the given categories by id. Categories present in the table
    but missing from `categories` are left alone (never deleted here) since
    existing charges reference category_id by id — the UI "remove" action is
    an archive toggle, not a hard delete, and always has been.
    """
    now = datetime.now(timezone.utc).isoformat()
    existing = {r["id"]: r["created_at"] for r in conn.execute("SELECT id, created_at FROM categories")}
    for i, cat in enumerate(categories):
        created_at = cat.get("created_at") or existing.get(cat["id"]) or now
        conn.execute(
            """
            INSERT INTO categories (id, name, monthly_target, color, archived, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              monthly_target = excluded.monthly_target,
              color = excluded.color,
              archived = excluded.archived,
              sort_order = excluded.sort_order
            """,
            (
                cat["id"],
                cat["name"],
                cat.get("monthly_target", 0),
                cat.get("color"),
                1 if cat.get("archived") else 0,
                i,
                created_at,
            ),
        )


def get_manual_income(conn: sqlite3.Connection) -> Optional[float]:
    row = conn.execute("SELECT manual_income FROM budget_meta WHERE id = 1").fetchone()
    return row["manual_income"] if row else None


def set_manual_income(conn: sqlite3.Connection, income: Optional[float]) -> None:
    conn.execute(
        """
        INSERT INTO budget_meta (id, manual_income) VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET manual_income = excluded.manual_income
        """,
        (income,),
    )
