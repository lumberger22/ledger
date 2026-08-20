"""
Sync orchestration: pulls accounts/balances, transactions, investment
holdings, and liability details from Plaid for one or all connected Items,
and writes the results into Ledger's own tables.

Transactions land in the same `charges` table (and the same
pending -> confirmed workflow) CSV uploads have always used, via
_upsert_transaction below, so Dashboard/Budget/Analysis/Charges keep working
unchanged. See PLAID_INTEGRATION_PLAN.md §4 for the reasoning.
"""

import json
import sqlite3
from datetime import datetime, timezone
from typing import Optional

import plaid

from services import balance_history, plaid_client
from services.analytics import find_prior_categorizations
from services.crypto import decrypt_token

# Plaid's sign convention is the opposite of Ledger's: a positive Plaid
# transaction amount means money left the account (a purchase); a negative
# amount means money came in (a deposit, refund, payment). Ledger stores
# spend as a negative `amount` and, like CSV upload, only tracks spend — so
# we flip the sign and skip inflows, exactly mirroring the existing
# "positive amounts are always ignored on import" CSV behavior.


def _plaid_error_code(exc: Exception) -> Optional[str]:
    body = getattr(exc, "body", None)
    if not body:
        return None
    try:
        return json.loads(body).get("error_code")
    except (ValueError, TypeError):
        return None


def _mark_item_status(conn: sqlite3.Connection, item_id: int, status: str, error: Optional[Exception] = None) -> None:
    code = _plaid_error_code(error) if error else None
    message = str(error) if error else None
    conn.execute(
        "UPDATE plaid_items SET status = ?, error_code = ?, error_message = ? WHERE id = ?",
        (status, code, message, item_id),
    )


def sync_item_accounts(conn: sqlite3.Connection, item: sqlite3.Row) -> int:
    access_token = decrypt_token(item["access_token"])
    data = plaid_client.get_accounts(access_token)
    now = datetime.now(timezone.utc).isoformat()

    count = 0
    for acct in data.get("accounts", []):
        balances = acct.get("balances") or {}
        conn.execute(
            """
            INSERT INTO accounts
              (plaid_account_id, plaid_item_id, name, official_name, mask, type, subtype,
               current_balance, available_balance, credit_limit, iso_currency_code,
               is_manual, last_balance_sync_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(plaid_account_id) DO UPDATE SET
              name = excluded.name,
              official_name = excluded.official_name,
              mask = excluded.mask,
              type = excluded.type,
              subtype = excluded.subtype,
              current_balance = excluded.current_balance,
              available_balance = excluded.available_balance,
              credit_limit = excluded.credit_limit,
              iso_currency_code = excluded.iso_currency_code,
              last_balance_sync_at = excluded.last_balance_sync_at
            """,
            (
                acct["account_id"],
                item["id"],
                acct.get("name") or "Account",
                acct.get("official_name"),
                acct.get("mask"),
                str(acct.get("type")) if acct.get("type") is not None else None,
                str(acct.get("subtype")) if acct.get("subtype") is not None else None,
                balances.get("current"),
                balances.get("available"),
                balances.get("limit"),
                balances.get("iso_currency_code") or "USD",
                now,
                now,
            ),
        )
        count += 1
    conn.commit()

    # Daily balance snapshot for the Net Worth / Investments trend charts —
    # see services/balance_history.py for why this has to be Ledger's own
    # record rather than something Plaid can back-fill.
    for row in conn.execute(
        "SELECT id, current_balance FROM accounts WHERE plaid_item_id = ?", (item["id"],)
    ).fetchall():
        balance_history.record_snapshot(conn, row["id"], row["current_balance"])
    conn.commit()

    return count


def _legacy_account_type(plaid_type: Optional[str]) -> str:
    """Map a Plaid account type to Ledger's older free-text account_type,
    kept for backward compatibility with anything still reading that column."""
    return "credit_card" if plaid_type == "credit" else "checking"


def _upsert_transaction(conn: sqlite3.Connection, txn: dict, account_row: sqlite3.Row) -> str:
    """Insert or refresh one Plaid transaction as a `charges` row. Returns
    'inserted', 'updated', 'skipped_inflow', or 'skipped_pending_hold'."""
    plaid_amount = txn.get("amount")
    if plaid_amount is None or plaid_amount <= 0:
        # Inflow (deposit/refund/payment) or a zero-amount row — Ledger only
        # tracks spend, same as CSV upload always has.
        return "skipped_inflow"

    date = txn.get("date") or txn.get("authorized_date")
    if not date:
        return "skipped_pending_hold"

    source = (txn.get("merchant_name") or txn.get("name") or "Unknown").strip()
    amount = -float(plaid_amount)  # flip to Ledger's negative-means-spend convention
    is_pending = bool(txn.get("pending"))
    txn_id = txn["transaction_id"]

    existing = conn.execute(
        "SELECT id FROM charges WHERE plaid_transaction_id = ?", (txn_id,)
    ).fetchone()
    now = datetime.now(timezone.utc).isoformat()

    if existing:
        conn.execute(
            """
            UPDATE charges SET date = ?, amount = ?, plaid_pending = ?, updated_at = ?
            WHERE plaid_transaction_id = ?
            """,
            (date, amount, 1 if is_pending else 0, now, txn_id),
        )
        return "updated"

    # New transaction: auto-categorize from merchant history exactly like
    # CSV upload does, and — per the decision to have Plaid actually remove
    # manual work rather than just replace the file picker — auto-confirm
    # straight into the budget when we recognize the merchant. Anything new
    # or unrecognized still lands in the pending review queue.
    prior = find_prior_categorizations(conn, [source])
    match = prior.get(source.strip().lower())
    category_id = match["category_id"] if match else None
    recurring = 1 if (match and match["recurring"]) else 0
    status = "confirmed" if match else "pending"

    conn.execute(
        """
        INSERT INTO charges
          (date, amount, source, nickname, category_id, recurring, notes, status,
           upload_batch_id, source_file, account_type, account_id, plaid_transaction_id,
           source_type, plaid_pending, created_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'plaid', ?, ?, ?)
        """,
        (
            date,
            amount,
            source,
            category_id,
            recurring,
            status,
            f"plaid-sync-{account_row['plaid_item_id']}",
            "plaid",
            _legacy_account_type(account_row["type"]),
            account_row["id"],
            txn_id,
            1 if is_pending else 0,
            now,
            now,
        ),
    )
    return "inserted"


def sync_item_transactions(conn: sqlite3.Connection, item: sqlite3.Row) -> dict:
    access_token = decrypt_token(item["access_token"])
    cursor = item["transactions_cursor"]

    accounts_by_plaid_id = {
        r["plaid_account_id"]: r
        for r in conn.execute(
            "SELECT * FROM accounts WHERE plaid_item_id = ?", (item["id"],)
        ).fetchall()
    }

    counts = {"inserted": 0, "updated": 0, "removed": 0, "skipped_inflow": 0, "skipped_pending_hold": 0}
    has_more = True
    while has_more:
        page = plaid_client.sync_transactions(access_token, cursor)

        for txn in page.get("added", []) + page.get("modified", []):
            account_row = accounts_by_plaid_id.get(txn.get("account_id"))
            if not account_row:
                # Shouldn't normally happen (accounts sync runs first), but
                # never let one unmatched account_id break the whole sync.
                continue
            result = _upsert_transaction(conn, txn, account_row)
            counts[result] = counts.get(result, 0) + 1

        for removed in page.get("removed", []):
            conn.execute(
                "DELETE FROM charges WHERE plaid_transaction_id = ?",
                (removed.get("transaction_id"),),
            )
            counts["removed"] += 1

        cursor = page.get("next_cursor")
        has_more = bool(page.get("has_more"))

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE plaid_items SET transactions_cursor = ?, last_synced_at = ? WHERE id = ?",
        (cursor, now, item["id"]),
    )
    conn.commit()
    return counts


def sync_item_investments(conn: sqlite3.Connection, item: sqlite3.Row) -> None:
    """Best-effort: most bank Items (e.g. Wells Fargo checking) don't have
    the investments product enabled at all, which Plaid reports as an error
    rather than an empty result — that's expected and not a sync failure."""
    access_token = decrypt_token(item["access_token"])
    try:
        data = plaid_client.get_investment_holdings(access_token)
    except plaid.ApiException:
        return

    securities = {s["security_id"]: s for s in data.get("securities", [])}
    accounts_by_plaid_id = {
        r["plaid_account_id"]: r["id"]
        for r in conn.execute(
            "SELECT * FROM accounts WHERE plaid_item_id = ?", (item["id"],)
        ).fetchall()
    }
    today = datetime.now(timezone.utc).date().isoformat()

    for holding in data.get("holdings", []):
        account_id = accounts_by_plaid_id.get(holding.get("account_id"))
        if not account_id:
            continue
        security = securities.get(holding.get("security_id"), {})
        sec_type = security.get("type")
        conn.execute(
            """
            INSERT INTO investment_holdings
              (account_id, security_id, ticker, name, security_type, quantity, price,
               value, cost_basis, as_of_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_id, security_id) DO UPDATE SET
              ticker = excluded.ticker, name = excluded.name, security_type = excluded.security_type,
              quantity = excluded.quantity, price = excluded.price, value = excluded.value,
              cost_basis = excluded.cost_basis, as_of_date = excluded.as_of_date
            """,
            (
                account_id,
                holding.get("security_id"),
                security.get("ticker_symbol"),
                security.get("name"),
                str(sec_type) if sec_type is not None else None,
                holding.get("quantity"),
                holding.get("institution_price"),
                holding.get("institution_value"),
                holding.get("cost_basis"),
                holding.get("institution_price_as_of") or today,
            ),
        )
    conn.commit()


def sync_item_liabilities(conn: sqlite3.Connection, item: sqlite3.Row) -> None:
    """Best-effort credit card APR/statement detail. Loan-specific fields
    (mortgage/student loan) aren't parsed yet — net worth still works off
    each account's current_balance regardless."""
    access_token = decrypt_token(item["access_token"])
    try:
        data = plaid_client.get_liabilities(access_token)
    except plaid.ApiException:
        return

    for credit in data.get("liabilities", {}).get("credit", []) or []:
        apr_pct = None
        for apr in credit.get("aprs", []) or []:
            if apr.get("apr_type") == "purchase_apr":
                apr_pct = apr.get("apr_percentage")
                break
        conn.execute(
            """
            UPDATE accounts SET apr_percentage = ?, minimum_payment = ?, last_statement_balance = ?
            WHERE plaid_account_id = ?
            """,
            (
                apr_pct,
                credit.get("minimum_payment_amount"),
                credit.get("last_statement_balance"),
                credit.get("account_id"),
            ),
        )
    conn.commit()


def sync_item(conn: sqlite3.Connection, item: sqlite3.Row) -> dict:
    """Full refresh for one Item: accounts/balances, transactions, then the
    optional investments/liabilities products. Never raises — failures are
    recorded on the item's status/error_message instead, so one broken
    connection never blocks the others."""
    try:
        sync_item_accounts(conn, item)
        # Re-fetch: sync_item_accounts may have inserted new account rows.
        item = conn.execute("SELECT * FROM plaid_items WHERE id = ?", (item["id"],)).fetchone()
        txn_counts = sync_item_transactions(conn, item)

        # Investments/liabilities are best-effort extras: most bank Items
        # (e.g. a Wells Fargo checking Item) simply don't have those
        # products enabled, and a parsing hiccup in either one shouldn't
        # mark the whole Item "error" when the core accounts+transactions
        # sync above actually succeeded.
        for optional_sync in (sync_item_investments, sync_item_liabilities):
            try:
                optional_sync(conn, item)
            except Exception:  # noqa: BLE001
                pass

        _mark_item_status(conn, item["id"], "good")
        conn.commit()
        return {"item_id": item["plaid_item_id"], "status": "good", **txn_counts}
    except plaid.ApiException as exc:
        code = _plaid_error_code(exc)
        status = "login_required" if code == "ITEM_LOGIN_REQUIRED" else "error"
        _mark_item_status(conn, item["id"], status, exc)
        conn.commit()
        return {"item_id": item["plaid_item_id"], "status": status, "error": code}
    except Exception as exc:  # noqa: BLE001 - one bad item must not kill the run
        _mark_item_status(conn, item["id"], "error", exc)
        conn.commit()
        return {"item_id": item["plaid_item_id"], "status": "error", "error": str(exc)}


def sync_all_items(conn: sqlite3.Connection) -> list:
    items = conn.execute("SELECT * FROM plaid_items").fetchall()
    return [sync_item(conn, item) for item in items]
