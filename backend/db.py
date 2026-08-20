"""
SQLite connection + schema initialization for the budgeting app.

All *charges* (pending and confirmed), budget *categories*, and everything
Plaid-related (connected items, accounts, investment holdings) live here.
Only `settings.json` (CSV column mappings, currency, theme) and the
paystub-deduction category config still live in JSON, via
services/json_store.py.
"""

import sqlite3
from datetime import datetime, timezone

from config import DATA_DIR, DB_PATH

# Ensure the data directory exists (config.py already mkdirs, but be safe).
DATA_DIR.mkdir(parents=True, exist_ok=True)

SCHEMA = """
CREATE TABLE IF NOT EXISTS charges (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date            TEXT NOT NULL,
  amount          REAL NOT NULL,
  source          TEXT NOT NULL,
  nickname        TEXT,
  category_id     TEXT,
  recurring       INTEGER DEFAULT 0,
  notes           TEXT,
  status          TEXT DEFAULT 'pending',
  upload_batch_id TEXT,
  source_file     TEXT,
  account_type    TEXT DEFAULT 'credit_card',
  created_at      TEXT,
  updated_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_charges_date ON charges(date);
CREATE INDEX IF NOT EXISTS idx_charges_category ON charges(category_id);
CREATE INDEX IF NOT EXISTS idx_charges_status ON charges(status);
CREATE INDEX IF NOT EXISTS idx_charges_batch ON charges(upload_batch_id);

CREATE TABLE IF NOT EXISTS paystubs (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  pay_period_start      TEXT NOT NULL,
  pay_period_end        TEXT NOT NULL,
  check_date            TEXT NOT NULL,
  gross_pay             REAL NOT NULL,
  net_pay               REAL NOT NULL,
  pretax_total          REAL NOT NULL DEFAULT 0,
  posttax_total         REAL NOT NULL DEFAULT 0,
  taxes_total           REAL NOT NULL DEFAULT 0,
  employer_benefits_total REAL NOT NULL DEFAULT 0,
  uploaded_at           TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paystubs_period_unique
  ON paystubs(pay_period_start, pay_period_end, check_date);
CREATE INDEX IF NOT EXISTS idx_paystubs_check_date ON paystubs(check_date);

CREATE TABLE IF NOT EXISTS paystub_line_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  paystub_id      INTEGER NOT NULL,
  section         TEXT NOT NULL,
  label           TEXT NOT NULL,
  amount          REAL NOT NULL,
  FOREIGN KEY (paystub_id) REFERENCES paystubs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paystub_line_items_paystub
  ON paystub_line_items(paystub_id);
CREATE INDEX IF NOT EXISTS idx_paystub_line_items_section
  ON paystub_line_items(section);

CREATE TABLE IF NOT EXISTS paystub_payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  paystub_id      INTEGER NOT NULL,
  bank            TEXT NOT NULL,
  account_label   TEXT NOT NULL,
  account_last4   TEXT,
  amount          REAL NOT NULL,
  FOREIGN KEY (paystub_id) REFERENCES paystubs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paystub_payments_paystub
  ON paystub_payments(paystub_id);

-- ---------- Budget categories (formerly budget.json) ----------

CREATE TABLE IF NOT EXISTS categories (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  monthly_target  REAL NOT NULL DEFAULT 0,
  color           TEXT,
  archived        INTEGER DEFAULT 0,
  sort_order      INTEGER DEFAULT 0,
  created_at      TEXT
);

-- Single-row table holding the manual income override that used to live at
-- budget.json's top-level "income" key.
CREATE TABLE IF NOT EXISTS budget_meta (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  manual_income   REAL
);

-- ---------- Plaid ----------

CREATE TABLE IF NOT EXISTS plaid_items (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  plaid_item_id         TEXT UNIQUE NOT NULL,
  institution_id        TEXT,
  institution_name      TEXT,
  access_token          TEXT NOT NULL,
  transactions_cursor   TEXT,
  status                TEXT DEFAULT 'good',
  error_code            TEXT,
  error_message         TEXT,
  created_at            TEXT NOT NULL,
  last_synced_at        TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  plaid_account_id        TEXT UNIQUE,
  plaid_item_id           INTEGER REFERENCES plaid_items(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  official_name           TEXT,
  mask                    TEXT,
  type                    TEXT,
  subtype                 TEXT,
  current_balance         REAL,
  available_balance       REAL,
  credit_limit            REAL,
  iso_currency_code       TEXT DEFAULT 'USD',
  apr_percentage          REAL,
  minimum_payment         REAL,
  last_statement_balance  REAL,
  is_manual               INTEGER DEFAULT 0,
  is_hidden               INTEGER DEFAULT 0,
  last_balance_sync_at    TEXT,
  created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_item ON accounts(plaid_item_id);

CREATE TABLE IF NOT EXISTS investment_holdings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  security_id     TEXT,
  ticker          TEXT,
  name            TEXT,
  security_type   TEXT,
  quantity        REAL,
  price           REAL,
  value           REAL,
  cost_basis      REAL,
  as_of_date      TEXT,
  UNIQUE(account_id, security_id)
);

CREATE INDEX IF NOT EXISTS idx_holdings_account ON investment_holdings(account_id);

-- Daily balance snapshots, one row per account per calendar day (UTC).
-- Plaid never exposes a retroactive balance history for any account type —
-- every call only returns the current balance — so this is Ledger's own
-- record, built up from whenever an account is connected (or a manual
-- balance is set), used for the Net Worth and Investments trend charts.
CREATE TABLE IF NOT EXISTS account_balance_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  balance         REAL,
  recorded_at     TEXT NOT NULL,
  UNIQUE(account_id, date)
);

CREATE INDEX IF NOT EXISTS idx_balance_history_account ON account_balance_history(account_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_date ON account_balance_history(date);
"""


def get_connection() -> sqlite3.Connection:
    """Return a new connection with row access by column name."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    """Add `column` to `table` if it doesn't already exist (lightweight migration)."""
    existing = [
        row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    ]
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def _migrate_categories_from_json(conn: sqlite3.Connection) -> None:
    """
    One-time (idempotent) import of budget.json's categories/income into the
    new `categories` / `budget_meta` tables. Runs on every startup but is a
    no-op once the `categories` table has at least one row — which also means
    restoring an old-format backup zip (which drops a legacy budget.json back
    into DATA_DIR and then calls init_db()) re-triggers the import
    automatically, as long as the restore wiped `charges` (and therefore
    categories) first.
    """
    from services.json_store import read_json  # local import: avoid cycles

    existing_count = conn.execute("SELECT COUNT(*) AS c FROM categories").fetchone()["c"]
    if existing_count > 0:
        return

    budget_path = DATA_DIR / "budget.json"
    if not budget_path.exists():
        return

    data = read_json(budget_path, {"categories": [], "income": None})
    categories = data.get("categories") or []
    for i, cat in enumerate(categories):
        conn.execute(
            """
            INSERT OR IGNORE INTO categories
              (id, name, monthly_target, color, archived, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                cat["id"],
                cat["name"],
                cat.get("monthly_target", 0),
                cat.get("color"),
                1 if cat.get("archived") else 0,
                i,
                cat.get("created_at") or datetime.now(timezone.utc).isoformat(),
            ),
        )

    income = data.get("income")
    conn.execute(
        "INSERT OR IGNORE INTO budget_meta (id, manual_income) VALUES (1, ?)",
        (income,),
    )


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)

        # Migrations for databases created before these columns existed.
        _ensure_column(conn, "charges", "account_type", "TEXT DEFAULT 'credit_card'")
        _ensure_column(conn, "charges", "account_id", "INTEGER REFERENCES accounts(id)")
        _ensure_column(conn, "charges", "plaid_transaction_id", "TEXT")
        _ensure_column(conn, "charges", "source_type", "TEXT DEFAULT 'csv'")
        _ensure_column(conn, "charges", "plaid_pending", "INTEGER DEFAULT 0")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_charges_plaid_txn "
            "ON charges(plaid_transaction_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_charges_account ON charges(account_id)"
        )
        _ensure_column(conn, "investment_holdings", "security_type", "TEXT")
        _ensure_column(conn, "investment_holdings", "cost_basis", "REAL")

        # Must run before the default budget_meta insert below: it uses
        # INSERT OR IGNORE keyed on id=1, so whichever of these runs first
        # wins the row. Migrating first lets a real income value from a
        # legacy budget.json (or a just-restored old-format backup) win;
        # the default insert then only fires when there was nothing to
        # migrate.
        _migrate_categories_from_json(conn)

        conn.execute(
            "INSERT OR IGNORE INTO budget_meta (id, manual_income) VALUES (1, NULL)"
        )

        conn.commit()
    finally:
        conn.close()
