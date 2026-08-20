"""
Daily balance snapshots per account, used to build the Net Worth and
Investments "value over time" trend charts.

Plaid never exposes a retroactive balance history for any account type —
every call (accounts/get, investments/holdings/get) only ever returns the
*current* balance — so a trend chart has to be Ledger's own record, built up
one snapshot at a time from whenever an account is connected (or a manual
balance is set). One row per account per calendar day (UTC); syncing more
than once a day just overwrites that day's row with the latest balance, so
the default 3-hour sync schedule naturally settles into one point per day.
"""

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional


def record_snapshot(
    conn: sqlite3.Connection,
    account_id: int,
    balance: Optional[float],
    date: Optional[str] = None,
) -> None:
    """No-op if balance is None (e.g. a brand-new account before its first
    real sync) rather than recording a misleading zero."""
    if balance is None:
        return
    day = date or datetime.now(timezone.utc).date().isoformat()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO account_balance_history (account_id, date, balance, recorded_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(account_id, date) DO UPDATE SET
          balance = excluded.balance,
          recorded_at = excluded.recorded_at
        """,
        (account_id, day, balance, now),
    )


def totals_by_date(
    conn: sqlite3.Connection, account_types: Iterable[str], days: int = 180
) -> list[dict]:
    """
    [{"date": "YYYY-MM-DD", "total": float}, ...] summed across every
    non-hidden account whose type is in `account_types`, for roughly the
    last `days` days.

    Each account's balance is forward-filled from its most recent snapshot
    at or before a given date, so an account that syncs less often than
    others (or hasn't synced today) still contributes its last-known value
    instead of dropping out of the total and making the line look like it
    dipped. An account with no snapshot at all before a given date simply
    contributes nothing for that date — it wasn't connected/tracked yet.
    """
    account_types = list(account_types)
    if not account_types:
        return []
    type_placeholders = ",".join("?" for _ in account_types)
    account_rows = conn.execute(
        f"SELECT id FROM accounts WHERE is_hidden = 0 AND type IN ({type_placeholders})",
        account_types,
    ).fetchall()
    account_ids = [r["id"] for r in account_rows]
    if not account_ids:
        return []

    acct_placeholders = ",".join("?" for _ in account_ids)
    snap_rows = conn.execute(
        f"""
        SELECT account_id, date, balance
        FROM account_balance_history
        WHERE account_id IN ({acct_placeholders})
        ORDER BY account_id, date
        """,
        account_ids,
    ).fetchall()

    by_account: dict[int, list[tuple]] = {aid: [] for aid in account_ids}
    for r in snap_rows:
        by_account[r["account_id"]].append((r["date"], r["balance"] or 0.0))

    all_dates = sorted({d for snaps in by_account.values() for d, _ in snaps})
    if not all_dates:
        return []

    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=days)).isoformat()
    window_dates = [d for d in all_dates if d >= cutoff]
    if not window_dates:
        # Every snapshot predates the requested window (e.g. `days` is small
        # and nothing has synced recently) — show the latest known point
        # instead of an empty chart.
        window_dates = all_dates[-1:]

    pointers = {aid: -1 for aid in account_ids}
    result = []
    for d in window_dates:
        total = 0.0
        for aid, snaps in by_account.items():
            idx = pointers[aid]
            while idx + 1 < len(snaps) and snaps[idx + 1][0] <= d:
                idx += 1
            pointers[aid] = idx
            if idx >= 0:
                total += snaps[idx][1]
        result.append({"date": d, "total": round(total, 2)})
    return result
