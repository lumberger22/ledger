# Budget App

A credit card budgeting app: upload CSV exports, manually categorize every
charge, track a monthly budget by category, and view spending analysis over time.

Runs locally on your machine **or** on [Railway](#deploy-to-railway) as a private
web app with remote storage.

Built with FastAPI + SQLite backend, React + Vite + Tailwind frontend.

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

---

## Where your data lives

Everything is stored locally in `user_data/`:

- `charges.db` — a SQLite database with every charge you've uploaded or entered
- `budget.json` — your categories, monthly targets, and target history
- `settings.json` — currency, date format, and CSV column mapping

Nothing leaves your machine. You can back all of it up any time from
**Settings → Backup & Export**, or just copy the `user_data/` folder.

---

## Using it

1. **Upload** (top-right button, any page). You can add multiple CSV files at
   once — pick each file and tell it whether that file is a **Credit Card**
   or **Checking Account** export, so the right column mapping is used for
   each. A credit card statement and a checking account export uploaded
   together land in the same review screen, and everything downstream
   (categorizing, budget, analysis) treats them identically as charges.
2. On the **Review Upload** screen, assign a category to every row (add new
   categories inline if needed), optionally add a nickname or mark something
   as recurring, then **Confirm All**.
3. Rows without a category block confirmation — you'll see exactly which ones.
4. From there:
   - **Dashboard** — budget status, top categories, and recent charges for
     whatever period you select
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
  ignored on import**, for both credit card and checking account files — this
  app only tracks spend.
- When you upload a CSV, any row whose merchant string matches a charge
  you've categorized before gets pre-filled with that same category (and its
  recurring flag) automatically, so repeat merchants don't need re-categorizing
  every time. New/unrecognized merchants still start blank.
- There is **one budget** (one set of categories and monthly targets) that
  applies at all times — it isn't month-specific. The period filter on the
  Budget and Dashboard pages only changes which confirmed charges get summed
  up against those targets; "3-Month Avg" divides the 3-month total by 3 so
  it's directly comparable to your monthly target.
- Split charges (one purchase across two categories) aren't supported yet —
  noted as a v1.1 feature in the original plan.

---

## Deploy to Railway

Host the app as a private web app with persistent remote storage. Local dev is
unchanged — auth is only enforced when `API_KEY` is set on the server.

### 1. Back up your local data

Before migrating, download a backup from **Settings → Download Backup** in the
local app (or copy the `user_data/` folder).

### 2. Create the Railway project

1. Push this repo to GitHub (if it isn't already).
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select this repository. Railway detects the `Dockerfile` via `railway.toml`.

### 3. Add a persistent volume

1. In your Railway service, open **Volumes** → **Add Volume**.
2. Mount path: `/data`
3. Size: 1 GB is plenty for personal use.

### 4. Set environment variables

In **Variables**, add:

| Variable | Value |
|----------|-------|
| `DATA_DIR` | `/data` |
| `API_KEY` | A long random string (e.g. `openssl rand -hex 32`) |

Railway sets `PORT` automatically — don't override it.

### 5. Deploy and restore your data

1. Wait for the first deploy to finish. Railway gives you a public URL like
   `https://your-app.up.railway.app`.
2. Open the URL — you'll see a login screen. Enter the `API_KEY` you set.
3. Go to **Settings → Restore from Backup** and upload the zip from step 1.
4. Reload — your categories, charges, and settings should match your local copy.

### 6. Ongoing use

- The Railway URL is your app from any browser.
- Click **Lock** in the nav bar to clear the session API key.
- Download backups regularly from **Settings** (same as local).
- Keep using the local install only if you want an offline copy — pick one
  source of truth to avoid drift.

### Local dev vs production

| | Local (`run.bat`) | Railway |
|--|-------------------|---------|
| Auth | Off (no `API_KEY`) | On (`API_KEY` required) |
| Data | `./user_data/` | `/data` volume |
| Frontend | Vite dev server (:5173) | Served by FastAPI (same URL) |
| API URL | `http://localhost:8000` | Same origin (no config needed) |

To test auth locally, set `API_KEY=something` in your shell before starting
the backend.
