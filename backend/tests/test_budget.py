"""
Tests for backend/routers/budget.py — the two places a silent budget-math
bug would actually cost Lucas money: the over-allocation guard on
update_budget() (shipped 2026-09-13, previously untested) and the
spent/target/status numbers budget_status() computes for every category
shown on the Budget and Dashboard pages.
"""

from datetime import date

import pytest
from fastapi import HTTPException

from models import BudgetUpdate, Category
from routers import budget as budget_router


def _category(cat_id, target, archived=False):
    return Category(
        id=cat_id, name=cat_id.title(), monthly_target=target, color="#2A6F6A", archived=archived
    )


def _insert_charge(conn, on_date, amount, category_id, status="confirmed"):
    """Insert a charge row directly — amount is negative for spend, matching
    the app's "spend only" sign convention (see spend_by_category())."""
    conn.execute(
        """
        INSERT INTO charges (date, amount, source, category_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (on_date, amount, "test-merchant", category_id, status, on_date, on_date),
    )
    conn.commit()


# ---------- update_budget(): over-allocation guard ----------


def test_blocks_when_active_targets_exceed_income(db_conn):
    update = BudgetUpdate(
        categories=[_category("rent", 2000), _category("food", 600)],
        income=2000,  # 2000 + 600 = 2600 budgeted against 2000 income
    )
    with pytest.raises(HTTPException) as exc_info:
        budget_router.update_budget(update)
    assert exc_info.value.status_code == 400
    assert "2600.00" in exc_info.value.detail
    assert "2000.00" in exc_info.value.detail


def test_allows_targets_at_or_under_income(db_conn):
    update = BudgetUpdate(
        categories=[_category("rent", 2000), _category("food", 600)],
        income=2600,  # exactly equal — should not be treated as "over"
    )
    result = budget_router.update_budget(update)
    assert result["income"] == 2600
    assert {c["id"] for c in result["categories"]} == {"rent", "food"}


def test_archived_categories_do_not_count_toward_the_cap(db_conn):
    """An archived category's target shouldn't compete for the budget —
    only active categories should be checked against income."""
    update = BudgetUpdate(
        categories=[
            _category("rent", 2000),
            _category("old-subscription", 5000, archived=True),
        ],
        income=2500,
    )
    result = budget_router.update_budget(update)  # must not raise
    assert result["income"] == 2500


def test_no_manual_income_skips_the_check_entirely(db_conn):
    """Without a manual income override there's no period-independent figure
    to check against (see the function's own docstring), so even a huge
    target list is allowed through rather than blocked on the wrong basis."""
    update = BudgetUpdate(categories=[_category("rent", 999_999)], income=None)
    result = budget_router.update_budget(update)
    assert result["income"] is None


# ---------- budget_status(): spend/target/status math ----------


def test_status_on_track_when_under_target(db_conn):
    budget_router.cats.upsert_categories(
        db_conn, [{"id": "food", "name": "Food", "monthly_target": 400, "color": "#111"}]
    )
    db_conn.commit()
    first_of_month = date.today().replace(day=1).isoformat()
    _insert_charge(db_conn, first_of_month, -150, "food")

    result = budget_router.budget_status(period="this_month", start=None, end=None)
    food = next(c for c in result["categories"] if c["id"] == "food")
    assert food["spent"] == 150.0
    assert food["status"] == "on_track"
    assert food["percent"] == pytest.approx(37.5)


def test_status_flips_to_behind_past_eighty_five_percent(db_conn):
    budget_router.cats.upsert_categories(
        db_conn, [{"id": "food", "name": "Food", "monthly_target": 100, "color": "#111"}]
    )
    db_conn.commit()
    on_date = date.today().replace(day=1).isoformat()
    _insert_charge(db_conn, on_date, -90, "food")

    result = budget_router.budget_status(period="this_month", start=None, end=None)
    food = next(c for c in result["categories"] if c["id"] == "food")
    assert food["status"] == "behind"


def test_status_flips_to_over_once_spend_exceeds_target(db_conn):
    budget_router.cats.upsert_categories(
        db_conn, [{"id": "food", "name": "Food", "monthly_target": 100, "color": "#111"}]
    )
    db_conn.commit()
    on_date = date.today().replace(day=1).isoformat()
    _insert_charge(db_conn, on_date, -150, "food")

    result = budget_router.budget_status(period="this_month", start=None, end=None)
    food = next(c for c in result["categories"] if c["id"] == "food")
    assert food["status"] == "over"
    assert food["spent"] == 150.0


def test_pending_charges_are_excluded_from_spend(db_conn):
    """Only confirmed charges should count — a pending (unreviewed) charge
    isn't real spend yet."""
    budget_router.cats.upsert_categories(
        db_conn, [{"id": "food", "name": "Food", "monthly_target": 100, "color": "#111"}]
    )
    db_conn.commit()
    on_date = date.today().replace(day=1).isoformat()
    _insert_charge(db_conn, on_date, -50, "food", status="confirmed")
    _insert_charge(db_conn, on_date, -999, "food", status="pending")

    result = budget_router.budget_status(period="this_month", start=None, end=None)
    food = next(c for c in result["categories"] if c["id"] == "food")
    assert food["spent"] == 50.0


def test_3month_avg_divides_spend_by_three(db_conn):
    budget_router.cats.upsert_categories(
        db_conn, [{"id": "food", "name": "Food", "monthly_target": 100, "color": "#111"}]
    )
    db_conn.commit()
    _insert_charge(db_conn, date.today().isoformat(), -300, "food")

    result = budget_router.budget_status(period="3month_avg", start=None, end=None)
    food = next(c for c in result["categories"] if c["id"] == "food")
    assert food["spent"] == 100.0


def test_manual_income_overrides_paystub_income(db_conn):
    budget_router.cats.set_manual_income(db_conn, 4200)
    db_conn.commit()

    result = budget_router.budget_status(period="this_month", start=None, end=None)
    assert result["income"] == 4200
    assert result["income_source"] == "manual"
