"""
services/analytics.py's resolve_period() turns a named period (or an
explicit custom range) into an (start, end) ISO date pair, and it's the one
place every period picker across Dashboard/Budget/Analysis ultimately
depends on. All of this is pure date math, so no DB is needed.
"""

from datetime import date, timedelta

from services.analytics import resolve_period, three_month_window


def test_this_month_spans_the_1st_to_today():
    start, end = resolve_period("this_month")
    today = date.today()
    assert start == today.replace(day=1).isoformat()
    assert end == today.isoformat()


def test_last_month_ends_the_day_before_this_month_starts():
    start, end = resolve_period("last_month")
    today = date.today()
    expected_end = today.replace(day=1) - timedelta(days=1)
    assert end == expected_end.isoformat()
    assert start == expected_end.replace(day=1).isoformat()


def test_ytd_starts_january_1st():
    start, end = resolve_period("ytd")
    today = date.today()
    assert start == date(today.year, 1, 1).isoformat()
    assert end == today.isoformat()


def test_30d_spans_exactly_thirty_days():
    start, end = resolve_period("30d")
    today = date.today()
    assert start == (today - timedelta(days=30)).isoformat()
    assert end == today.isoformat()


def test_custom_passes_explicit_dates_straight_through():
    start, end = resolve_period("custom", start="2026-01-15", end="2026-02-20")
    assert (start, end) == ("2026-01-15", "2026-02-20")


def test_custom_without_both_dates_falls_back_to_this_month():
    """The "custom" branch only fires when *both* start and end are given —
    a caller that forgets one shouldn't get a half-applied custom range."""
    start, end = resolve_period("custom", start="2026-01-15", end=None)
    today = date.today()
    assert start == today.replace(day=1).isoformat()
    assert end == today.isoformat()


def test_unknown_period_falls_back_to_this_month():
    start, end = resolve_period("not-a-real-period")
    today = date.today()
    assert start == today.replace(day=1).isoformat()


def test_three_month_window_includes_the_anchor_month():
    start, end = three_month_window(date(2026, 3, 15))
    assert start == date(2026, 1, 1)
    assert end == date(2026, 3, 15)


def test_three_month_window_rolls_over_the_year_boundary():
    start, end = three_month_window(date(2026, 2, 10))
    assert start == date(2025, 12, 1)
    assert end == date(2026, 2, 10)
