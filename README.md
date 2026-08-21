# Ledger

A personal financial tracking app: connect your bank, credit card, and
investment accounts through Plaid for live balances and automatic
transaction import, categorize spend, track a monthly budget by category,
and see net worth and spending analysis over time. Manual CSV/PDF import and
manual entry still work too, as a fallback for anything Plaid doesn't cover.

Runs locally on your machine for development, and in production on an EC2
instance behind a Cloudflare Tunnel at **lucasledger.uk** (see
[Deploy](#deploy) below).

Built with FastAPI + SQLite backend, React + Vite + Tailwind frontend, and
[Plaid](https://plaid.com) for account connections.

---

## First-time setup

You'll need:

- **Python 3.10+** (check with `python --version` in a terminal)
- **Node.js 18+** (check with `node --version`)

### Windows

Double-click **`run.bat`** in this folder. It will:

1. Create a Python virtual environment in `backend\.venv`
2. Install backend dependencies
3. Install frontend dependencies (first run only, takes a minute or two)
4. Open two terminal windows — one running the API on port 8000, one running
   the frontend dev server on port 5173

Then open **http://localhost:5173** in your browser (it usually opens automatically).

To stop the app, close both terminal windows.

### macOS / Linux

```bash
./run.sh
```

Same behavior as above, in one terminal. Press `Ctrl+C` to stop both servers.

### Manual setup (any OS)

```bash
# Backend
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt      # Windows: .venv\Scripts\pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000  # Windows: .venv\Scripts\uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

The API's interactive docs are available at **http://localhost:8000/docs** any
time the backend is running — useful for poking at endpoints directly.

Plaid features stay off until you set `PLAID_CLIENT_ID` / `PLAID_SECRET` /
`PLAID_TOKEN_ENCRYPTION_KEY` (see [below](#connecting-accounts-with-plaid)) —
everything else works exactly the same without them.

---

## Where your data lives

Everything is stored locally in `user_data/`:

- `charges.db` — a single SQLite database with every charge you've uploaded,
  entered, or synced from Plaid; your budget categories; and everything
  Plaid-related (connected institutions/items, accounts, balances,
  investment holdings). Plaid access tokens are stored encrypted inside it
  — see [Connecting accounts with Plaid](#connecting-accounts-with-plaid).
- `settings.json` — currency, date format, and CSV column mapping

Nothing leaves your machine (or your EC2 instance, in production) except
what Plaid needs to fetch your linked accounts' data. You can back all of it
up any time from **Settings → Backup & Export**, or just copy the
`user_data/` folder. Treat backup zips as sensitive — they include the
encrypted Plaid access tokens.

---

## Using it

1. **Connect an account** (Accounts page) for anything Plaid supports —
   checking/savings, credit cards, brokerage, and retirement accounts.
   Balances and transactions sync automatically from there; a background job
   keeps them current, and **Sync Now** on the Accounts page forces an
   immediate refresh.
2. Alternatively, **Upload** (top-right button, any page) still works for
   CSV exports or a PDF payslip, for institutions Plaid doesn't cover. You
   can add multiple CSV files at once — pick each file and tell it whether
   that file is a **Credit Card** or **Checking Account** export, so the
   right column mapping is used for each.
3. New transactions land in a review queue only when the merchant hasn't
   been seen before — recognized merchants (from prior categorization, CSV
   or Plaid) auto-categorize straight into the budget. Everything else
   (a CSV batch, or unrecognized transactions from a connected account)
   shows up as a **"N to review"** link on the Accounts page and as a banner
   on the Charges page — click through to the review screen, assign a
   category to every remaining row (add new categories inline if needed),
   optionally add a nickname or mark something as recurring, then
   **Confirm All**. Rows without a category block confirmation — you'll see
   exactly which ones. Charges only show up on the Charges page once
   confirmed, whether they came from a CSV or from Plaid.
4. From there:
   - **Dashboard** — budget status, net worth snapshot, top categories, and
     recent charges for whatever period you select
   - **Accounts** — every connected institution, collapsible to show/hide
     its individual accounts, with live balances, reconnect/disconnect, and
     manual accounts (e.g. cash) that don't come from Plaid
   - **Investments** — holdings, asset-type allocation, unrealized gain/loss,
     and a value-over-time chart for every connected brokerage/401k/403b/IRA
   - **Net Worth** — assets vs. liabilities across every connected and
     manual account, plus a net-worth-over-time chart
   - **Charges** — full history with filtering, sorting (including by
     source name), inline editing, and manual entry (for cash spend, etc.)
   - **Budget** — targets vs. actual spend per category, with expandable rows
     to see the charges behind each number
   - **Analysis** — category breakdown, 6-month trend, top spending sources
     (top 3 with an option to expand and see all, totaled for whichever
     period you've selected), recurring vs. one-time split, period
     comparisons, and a pace projection for the current month
   - **Settings** — CSV column mapping for both credit card and checking
     account exports, backup/export, and a reset option

## Notes

- If your bank's CSV uses different column headers than the defaults, update
  the mapping for that account type in **Settings** before uploading.
- Pending/hold charges with malformed amounts are skipped automatically during
  upload rather than failing the whole import; you'll see a warning listing
  which rows were skipped.
- **Positive amounts (deposits, paychecks, payments, refunds) are always
  ignored on import**, whether from a CSV, manual entry, or Plaid — this app
  only tracks spend. A Plaid transaction with a pending hold amount that
  later posts at a different amount updates in place rather than duplicating.
- Any charge whose merchant string matches one you've categorized before
  gets pre-filled with that same category (and its recurring flag)
  automatically — for CSV uploads this pre-fills the review screen; for
  Plaid-synced transactions it auto-confirms straight into the budget, no
  review needed. New/unrecognized merchants still start blank either way,
  and land wherever the "N to review" link on Accounts/Charges points —
  transactions from every connected account share one review queue there,
  regardless of which institution or Sync Now run they came from.
- There is **one budget** (one set of categories and monthly targets) that
  applies at all times — it isn't month-specific. The period filter on the
  Budget and Dashboard pages only changes which confirmed charges get summed
  up against those targets; "3-Month Avg" divides the 3-month total by 3 so
  it's directly comparable to your monthly target.
- Split charges (one purchase across two categories) aren't supported yet —
  noted as a v1.1 feature in the original plan.
- Disconnecting an institution on the Accounts page keeps its historical
  charges (spending history doesn't disappear) — it just stops new
  transactions and balances from syncing.
- Plaid never hands over a retroactive balance history — every call only
  ever returns the *current* balance, for accounts and investment holdings
  alike. The Net Worth and Investments trend charts are built from Ledger's
  own daily snapshots instead (taken on every sync and every manual balance
  edit), so they start as a single point on whatever day an account was
  first connected and fill in from there — there's no way to backfill a
  chart for time before that.
- Cost basis (and therefore gain/loss) on a holding depends on what the
  institution reports to Plaid — some accounts, especially older 401k/403b
  plans, don't include it. Those holdings still show up with a value, just
  without a gain/loss figure.

---

## Connecting accounts with Plaid

Ledger uses [Plaid](https://plaid.com)'s free Trial plan (10 connected
Items, uncapped API calls per Item) to pull live balances and transactions
from Wells Fargo, Fidelity, Charles Schwab, and other supported
institutions. See `PLAID_INTEGRATION_PLAN.md` at the repo root for the full
design/rationale; this section is just the setup steps.

### 1. Get Plaid credentials

Locally, these live in a `.env` file at the repo root (next to `README.md`,
`backend/`, `frontend/`) — `backend/config.py` loads it automatically via
`python-dotenv`, so plain `uvicorn` / `run.bat` / `run.sh` all pick it up
with no shell exports needed. It's gitignored, so it's safe to put real
secrets in it; `.env.example` is the checked-in template if you ever need to
recreate it (`cp .env.example .env`). In production, the EC2 host's real
environment variables are set directly instead — there's no `.env` file in
the Docker image, and a real env var there always wins over anything in
`.env` anyway.

1. Sign up at [dashboard.plaid.com](https://dashboard.plaid.com) and create
   an app — this gives you a `client_id` and a Sandbox `secret`.
2. Open `.env` and fill in:

   ```
   PLAID_CLIENT_ID=...
   PLAID_SECRET=...          # the Sandbox secret to start
   PLAID_ENV=sandbox
   PLAID_TOKEN_ENCRYPTION_KEY=...
   ```

   Generate the encryption key once with:

   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

   **Back this key up somewhere durable, outside the repo.** Losing it makes
   every stored access token permanently undecryptable — every account
   would need to be re-linked.

3. Restart the backend. The Accounts page's **Connect Account** button will
   start working; without these three variables set it stays disabled with
   an explanation instead of erroring.

### 2. Test in Sandbox first

With `PLAID_ENV=sandbox`, Plaid Link connects to fake test institutions
using Plaid's documented Sandbox credentials (e.g. username `user_good`,
password `pass_good`) — no real bank data involved. Use this to validate the
whole connect → sync → review flow before linking anything real.

### 3. Go to production

1. In the Plaid dashboard ([dashboard.plaid.com/developers/keys](https://dashboard.plaid.com/developers/keys)),
   grab the Production `secret` — on the Trial plan this is auto-approved
   for most developers, no multi-day review. You may be prompted to fill in
   a "use case description" under Link Customization first; Plaid requires
   that before Link will work in Production.
2. Update the environment: `PLAID_SECRET` to the Production secret,
   `PLAID_ENV=production`. `PLAID_CLIENT_ID` stays the same across
   environments; only the secret changes.
3. Link Wells Fargo first, then Fidelity and Charles Schwab. All three use
   Plaid's OAuth-based Link flow, but the Trial plan already includes access
   to most OAuth institutions without the separate full-Production OAuth
   registration process — no extra approval step expected, though it's
   worth confirming in the dashboard before relying on it.
4. `PLAID_WEBHOOK_URL` is optional and off by default here on purpose: the
   `/api/plaid/webhook` endpoint currently trusts any POST that names a
   known `item_id`, with no signature verification (Plaid can't send the
   app's `X-API-Key`, so this is intentionally the one unauthenticated
   route — see the comment in `routers/plaid.py`). Leaving it unset is
   fine — balances and transactions still update on the scheduled sync
   (`PLAID_SYNC_INTERVAL_MINUTES`, default every 3 hours) and via manual
   **Sync Now**. Only set it once the webhook verifies Plaid's JWT
   signature.

### Notes

- Every connected institution counts as one Plaid "Item" against the Trial
  plan's 10-Item limit, regardless of how many accounts it exposes (e.g.
  Wells Fargo checking + credit card typically come through as accounts
  under a single Item).
- **Plaid explicitly warns: persist your access tokens and don't lose track
  of them — every access token created in Production counts against the
  Trial Item limit even after you stop using it.** Disconnecting an
  institution from the Accounts page calls Plaid's `/item/remove` to
  actually release the Item (not just forget it locally), so it stops
  counting — don't just delete `charges.db` and assume old Items are gone.
- Investment holdings and credit card/loan liability details (APR, minimum
  payment) sync best-effort — most bank Items simply don't have those
  products enabled, which is expected, not an error. Net worth is
  calculated from each account's balance regardless.

---

## Deploy

Ledger runs in production as a single Docker container on an EC2 instance,
exposed at **lucasledger.uk** through a Cloudflare Tunnel (which also
provides the HTTPS that Plaid Link and Plaid webhooks require).

### Environment

Set on the EC2 host (wherever `server-deploy.sh` / your process manager
injects environment variables into the container):

| Variable | Purpose |
|----------|---------|
| `DATA_DIR` | Persistent data directory (a mounted volume/bind mount, e.g. `/data`) |
| `API_KEY` | Long random string (e.g. `openssl rand -hex 32`) — required in production |
| `ALLOWED_ORIGINS` | Leave unset for same-origin (the normal production setup) |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` / `PLAID_ENV` / `PLAID_TOKEN_ENCRYPTION_KEY` | See [Connecting accounts with Plaid](#connecting-accounts-with-plaid) |
| `PLAID_WEBHOOK_URL` | e.g. `https://lucasledger.uk/api/plaid/webhook` |

### Deploying

```bash
./deploy.sh
```

SSHes to the EC2 instance and runs `server-deploy.sh` there, which rebuilds
and restarts the Docker container. The persistent volume at `DATA_DIR`
(containing `charges.db` and `settings.json`) survives redeploys.

### Backing up before a risky change

Download a backup from **Settings → Download Backup** before any migration
or major change — it's the SQLite file (charges, categories, Plaid
items/accounts/balances) plus `settings.json`, restorable from the same
Settings page.

### Local dev vs production

| | Local (`run.bat` / `run.sh`) | Production (EC2) |
|--|-------------------------------|-------------------|
| Auth | Off (no `API_KEY`) | On (`API_KEY` required) |
| Data | `./user_data/` | `DATA_DIR` volume on the host |
| Frontend | Vite dev server (:5173) | Served by FastAPI (same origin) |
| API URL | `http://localhost:8000` | Same origin (no config needed) |
| Plaid | Sandbox (or off) | Production, once verified |

To test auth locally, set `API_KEY=something` in your shell before starting
the backend.
