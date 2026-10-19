"""
Tests for services/analytics.py's category_budget_variance_history(), which
powers the "Budget Variance History" card on the Analysis page.

Regression coverage for a bug where the card always showed "Not enough
history yet": the function looked for a category's budget under the keys
"budget"/"monthly_budget"/"budget_amount"/"limit", but categories are
actually stored (and returned by categories_store.list_categories()) with
the field "monthly_target" — so no category ever matched and the history
was always empty.

Also covers the per-month spend/variance figures and the category-level
budget figure added for the card's richer hover tooltip and header line.
"""

from datetime import date

from services.analytics import category_budget_variance_history


def _category(cat_id, monthly_target, archived=False, name=None, color="#2A6F6A"):
    """A plain dict shaped like categories_store.list_categories() rows —
    category_budget_variance_history() reads cat["id"]/cat.get(...) off
    exactly this shape, not a pydantic model."""
    return {
        "id": cat_id,
        "name": name or cat_id.title(),
        "monthly_target": monthly_target,
        "color": color,
        "archived": archived,
    }


def _insert_charge(conn, on_date, amount, category_id, status="confirmed"):
    conn.execute(
        """
        INSERT INTO charges (date, amount, source, category_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (on_date, amount, "test-merchant", category_id, status, on_date, on_date),
    )
    conn.commit()


def _this_month_day(day=5):
    today = date.today()
    return today.replace(day=min(day, 28)).isoformat()


def test_category_with_a_set_target_appears_in_history(db_conn):
    categories = [_category("groceries", 400)]
    _insert_charge(db_conn, _this_month_day(), -100, "groceries")

    history = category_budget_variance_history(db_conn, categories)

    assert len(history) == 1
    assert history[0]["category_id"] == "groceries"
    assert history[0]["budget"] == 400
    assert history[0]["months"][-1]["status"] == "under"


def test_spend_over_target_is_flagged_over_with_positive_variance(db_conn):
    categories = [_category("dining", 150)]
    _insert_charge(db_conn, _this_month_day(), -200, "dining")

    history = category_budget_variance_history(db_conn, categories)
    latest = history[0]["months"][-1]

    assert latest["status"] == "over"
    assert latest["spent"] == 200
    assert latest["variance"] == 50


def test_spend_under_target_has_negative_variance(db_conn):
    categories = [_category("dining", 150)]
    _insert_charge(db_conn, _this_month_day(), -90, "dining")

    history = category_budget_variance_history(db_conn, categories)
    latest = history[0]["months"][-1]

    assert latest["status"] == "under"
    assert latest["spent"] == 90
    assert latest["variance"] == -60


def test_spend_equal_to_target_is_on_budget_with_zero_variance(db_conn):
    categories = [_category("subscriptions", 50)]
    _insert_charge(db_conn, _this_month_day(), -50, "subscriptions")

    history = category_budget_variance_history(db_conn, categories)
    latest = history[0]["months"][-1]

    assert latest["status"] == "on_budget"
    assert latest["variance"] == 0


def test_category_with_no_target_set_is_excluded(db_conn):
    """monthly_target defaults to 0 for a category that was never given a
    budget — it shouldn't show up as a fake "$0 budget" streak."""
    categories = [_category("uncategorized", 0)]
    _insert_charge(db_conn, _this_month_day(), -30, "uncategorized")

    history = category_budget_variance_history(db_conn, categories)

    assert history == []


def test_archived_categories_are_excluded(db_conn):
    categories = [_category("old-gym", 60, archived=True)]
    _insert_charge(db_conn, _this_month_day(), -60, "old-gym")

    history = category_budget_variance_history(db_conn, categories)

    assert history == []


def test_pending_charges_do_not_count_as_spend(db_conn):
    categories = [_category("travel", 200)]
    _insert_charge(db_conn, _this_month_day(), -500, "travel", status="pending")

    history = category_budget_variance_history(db_conn, categories)
    latest = history[0]["months"][-1]

    assert latest["status"] == "under"
    assert latest["spent"] == 0
    assert latest["variance"] == -200


def test_history_covers_six_months_by_default(db_conn):
    categories = [_category("groceries", 400)]

    history = category_budget_variance_history(db_conn, categories)

    assert len(history[0]["months"]) == 6
    for entry in history[0]["months"]:
        assert entry["spent"] == 0
        assert entry["variance"] == -400
