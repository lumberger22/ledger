"""
SQLite connection + schema initialization for the budgeting app.

All *charges* (pending and confirmed) live here. Everything else
(settings, budget/categories) lives in JSON files handled by
services/json_store.py.
"""

import sqlite3

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


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        # Migration for databases created before account_type existed.
        _ensure_column(conn, "charges", "account_type", "TEXT DEFAULT 'credit_card'")
        conn.commit()
    finally:
        conn.close()
