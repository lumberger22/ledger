# Ledger Security Hardening Plan

Written 2026-08-24 against the current codebase: FastAPI backend (`backend/`),
React/Vite frontend (`frontend/`), single shared password (`API_KEY`) auth,
SQLite storage, deployed to EC2 (see `deploy.sh`, `Dockerfile`) with Plaid
integration for live bank data. This is a single-user personal-finance app,
not a multi-tenant SaaS — the recommendations below are scoped accordingly
(no need for per-user rate limits, RBAC, etc.), but a few of the findings are
real vulnerabilities worth fixing regardless of user count.

Three items marked **[DONE]** below were fixed directly in this session
because they were small, safe, and squarely inside what you asked about
(routing/path protection and injection-adjacent hardening). Everything else
is scoped out as a plan for you to work through.

## Quick-reference checklist

**Critical**
- [DONE] Path traversal in the SPA static-file fallback (`backend/main.py`)
- [DONE] Rate limiting + lockout on the password/API key, plus a coarser general per-IP limiter (`backend/auth.py`, `backend/main.py`, `backend/services/rate_limit.py`)
- [DONE] HTTP security headers, incl. CSP in report-only mode (`backend/main.py`)

**High**
- [DONE] Timing-unsafe API key comparison (`backend/auth.py`)
- [DONE] Request body / upload size limits, 10 MB default (`backend/services/upload_limits.py`, `routers/upload.py`, `routers/income.py`)
- [DONE] Docker container runs as non-root `appuser` (`Dockerfile`)
- [DONE] Plaid webhook JWT signature verification (`backend/services/plaid_client.py`'s `verify_webhook`, `routers/plaid.py`)

**Medium**
- [DONE] CORS methods/headers narrowed from `*` (`backend/main.py`)
- [ ] No dependency vulnerability scanning in the deploy pipeline
- [DONE] Structured auth-failure/rate-limit logging (`logger.warning` in `auth.py` and `main.py`)
- [ ] `ENABLE_DOCS` / `/docs` exposure story is manual, not enforced

**Low**
- [ ] CSV formula-injection risk if charge data is ever re-exported to CSV/Excel (still not applicable — no export path exists yet; revisit if one's added)
- [ ] No `.dockerignore` verification that secrets can't leak into the build context
- [ ] API key stored in `localStorage` (XSS would expose it — acceptable tradeoff for this app, documented below)

**Implemented 2026-08-24, second pass.** All Critical and High items are now
done, along with CORS narrowing and auth-failure logging from Medium. See
each numbered section below for what changed and why; the two-sentence
version: rate limiting closes the brute-force gap (§1/§2), upload caps close
the DoS gap (§7), the Dockerfile no longer runs as root (§9), and the Plaid
webhook now verifies Plaid's JWT signature before trusting a POST (§10).
Remaining open items — dependency scanning, `/docs` enforcement, CSV
formula-injection (dormant until an export feature exists), `.dockerignore`
secret verification, and the accepted `localStorage` tradeoff — are all Low/
Medium and fine to pick up opportunistically.

---

## 1. Authentication: rate limiting & lockout

**[DONE]** Implemented as a plain in-memory sliding-window limiter (`backend/services/rate_limit.py`), not `slowapi` -- one fewer dependency for the same effect at this scale. `backend/auth.py` now blocks an IP for 5 minutes after 10 failed keys, returning 429 + `Retry-After` before even running the `hmac.compare_digest` check once blocked (blunts timing attacks too). `config.py` also now warns on startup if `API_KEY` is set but under 20 characters.

**Current state.** There's no login endpoint per se — the frontend just
retries `GET /api/settings` with whatever `X-API-Key` the user typed
(`frontend/src/pages/Login.jsx`), and `backend/auth.py`'s middleware checks
that header against `API_KEY` on every `/api/*` request. There is currently
**no limit on how many times a value can be tried**, from any IP, ever. For
an app whose only credential is a single password, this is the single
highest-value gap: an attacker who can reach `/api/settings` can brute-force
`API_KEY` at whatever rate the network allows.

**Recommendation.** Add an in-memory (or Redis-backed, if you ever run more
than one instance) sliding-window limiter keyed by client IP, applied before
`verify_api_key` runs. A simple approach with [`slowapi`](https://github.com/laurentS/slowapi)
(a FastAPI-friendly wrapper around `limits`):

```python
# requirements.txt
slowapi==0.1.9
```

```python
# backend/main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

Then in `auth_middleware`, count failed attempts per IP and return 429 with
a `Retry-After` header once a threshold is hit (e.g. 10 failures / 5 minutes,
then an exponential backoff). Because there's no separate `/login` route on
the backend, the limiter has to key off *failed auth attempts specifically*
(401s from `verify_api_key`), not just request volume — otherwise normal app
usage (dozens of legitimate `/api/*` calls per page load) would trip it.

Sketch:

```python
from collections import defaultdict
from time import time

_failed_attempts: dict[str, list[float]] = defaultdict(list)
MAX_ATTEMPTS = 10
WINDOW_SECONDS = 300

def _too_many_failures(ip: str) -> bool:
    now = time()
    attempts = [t for t in _failed_attempts[ip] if now - t < WINDOW_SECONDS]
    _failed_attempts[ip] = attempts
    return len(attempts) >= MAX_ATTEMPTS

def _record_failure(ip: str) -> None:
    _failed_attempts[ip].append(time())
```

Call `_too_many_failures` first (return 429 immediately, don't even check
the key — this also blunts timing side channels), and `_record_failure`
whenever `hmac.compare_digest` fails. This is process-local state, which is
fine for a single-instance EC2 deployment; note it resets on restart and
won't share state across multiple app instances if you ever scale out.

Also worth adding: a minimum `API_KEY` length/entropy check in `config.py`
(warn or refuse to start if it's short) so this protection isn't undermined
by a weak password in the first place.

## 2. General rate limiting (beyond auth)

**[DONE]** Added as `rate_limit_middleware` in `backend/main.py`: 180 req/min per IP across `/api/*` (`/api/health` exempt), with `/api/plaid/webhook` on its own 30 req/min counter. Same `SlidingWindowLimiter` class as §1, different instance/keying.

Separately from brute-force protection, apply a coarser global rate limit
(e.g. 60–120 req/min per IP) to all `/api/*` routes to blunt scraping,
accidental client-side retry storms, and resource-exhaustion attempts
against the heavier endpoints (`/api/upload`, `/api/plaid/sync`, anything
touching `pandas`/`pdfplumber`). `slowapi`'s `@limiter.limit("100/minute")`
decorator can be applied per-router or globally via `app.state.limiter`.
Give `/api/plaid/webhook` its own, more permissive limit since Plaid may
legitimately fire several webhooks in quick succession.

## 3. Injection protection

**SQL injection: already in good shape.** Every query in `backend/db.py`
and the routers (`routers/plaid.py`, `routers/upload.py`, etc.) uses
parameterized `?` placeholders — I grepped for string-formatted SQL
(`f"SELECT`, `.format(`, `%` interpolation) and found none. Keep this
discipline as new queries are added; the only thing worth adding is a
pre-commit or CI grep check that fails the build if a raw f-string ever
appears next to `conn.execute(`.

**Command injection: not applicable.** No `subprocess`/`os.system`/`eval`
calls take user input anywhere in `backend/`.

**Path traversal: [DONE] fixed this session.** `backend/main.py`'s SPA
fallback route (`serve_spa`) took the URL's `full_path` and joined it
directly onto `STATIC_DIR` before checking `.is_file()`:

```python
file_path = STATIC_DIR / full_path
if file_path.is_file():
    return FileResponse(file_path)
```

`Path` joining doesn't sanitize `..` segments, so a request like
`GET /../../../../etc/passwd` (or a `%2e%2e`-encoded variant, depending on
how strictly the reverse proxy in front of it normalizes paths) could
resolve outside `STATIC_DIR` and serve arbitrary files off the host. Fixed
to resolve the candidate path and verify it's still inside `STATIC_DIR`
before serving it, falling back to the SPA shell (`index.html`) otherwise —
same behavior for legitimate client-side routes, but an escape attempt now
just gets the app shell instead of a file read. The `/assets` mount already
used Starlette's `StaticFiles`, which has its own traversal protection, so
that path was never affected.

**CSV formula injection (low priority, worth knowing about).** `source`
values from uploaded CSVs (`services/csv_parser.py`) are stored and
displayed as-is. If Ledger ever grows a "export charges to CSV" feature, a
`source` string starting with `=`, `+`, `-`, or `@` (e.g. a merchant name an
attacker controls, or a maliciously crafted bank export) could be
interpreted as a formula by Excel/Sheets when the export is opened. Not
exploitable today since there's no export path, but if you add one, prefix
such values with a `'` or wrap them in `="..."` on the way out.

## 4. CORS

**[DONE]** `allow_methods` narrowed to `GET, POST, PUT, DELETE, OPTIONS` and `allow_headers` to `Content-Type, X-API-Key` in `backend/main.py`. Still worth double-checking the production `ALLOWED_ORIGINS` env var on EC2 as noted below -- that's unchanged.

**Current state (`backend/main.py` + `config.py`):** origin allowlist driven
by `ALLOWED_ORIGINS` (defaults to the two local Vite dev origins),
`allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`. This
is reasonable — the dangerous combination (`allow_origins=["*"]` with
`allow_credentials=True`) isn't in play here since origins are an explicit
list, not a wildcard.

**Tighten anyway:**
- Narrow `allow_methods` to the actual verbs you use (`GET, POST, PUT,
  DELETE, OPTIONS`) instead of `*` — costs nothing and removes one
  reflexive "why is PATCH allowed" question during a future audit.
- Narrow `allow_headers` to `["Content-Type", "X-API-Key"]` instead of `*`,
  for the same reason.
- Double check the production `ALLOWED_ORIGINS` env var on EC2 only lists
  `https://lucasledger.uk` (or whatever your real domain is) — a leftover
  `http://` or wildcard entry there is the actual risk, not the code.

## 5. Routing & path protection (frontend)

**Fixed this session** — this was the two behavioral asks alongside the plan:

- **Unauthenticated visits now redirect to `/login`.** Previously
  `App.jsx` swapped in the `<Login>` component when locked, but left the
  browser's URL bar showing whatever path was originally requested (e.g. a
  deep link to `/settings`) — the lock screen was visually on top of the
  route rather than the route actually changing. Now, whenever `authState`
  is `"locked"` and the current path isn't already `/login`, the app calls
  `navigate("/login", { replace: true, state: { from: location } })`, so
  the address bar reflects reality and a successful login sends you back to
  wherever you were headed.
- **Logging out now resets to a stable path.** The "Lock" button (renamed
  to **"Log out"**, see below) previously just flipped `authState` back to
  `"locked"` without touching the route — so if you logged out from
  `/budget`, the URL stayed `/budget` with the login screen rendered over
  it, and a fresh visit to that URL later would still try to resume there.
  `handleLogout` now explicitly navigates to `/login` with `replace: true`
  before anything else, so logging out always lands on the same known page.
- Added catch-all routes so an authenticated visit to `/login` (typed
  manually, stale tab, back button) redirects into the app instead of
  rendering nothing, and any unmatched path redirects to `/` rather than
  silently rendering a blank `<main>`.
- Renamed the nav button from **"Lock"** to **"Log out"** (`NavBar.jsx`) —
  matches what it now actually does (clears the stored key and returns to
  the login page), rather than reading like a re-lock that keeps your
  session.

**Backend path protection:** covered above (the SPA traversal fix). One
more thing worth doing: FastAPI already blocks direct hits to `/api/*` paths
falling through to `serve_spa` (`if full_path.startswith("api/")`), but this
is a string prefix check — confirm it still 404s correctly for something
like `/API/health` or `/api%2Fhealth` if you ever front this with a proxy
that doesn't normalize case/encoding before forwarding. Not a live issue
today (FastAPI's router matches `/api/health` exactly and case-sensitively
before ever reaching this catch-all), just something to keep in mind if a
CDN/WAF layer changes how requests are normalized.

## 6. HTTP security headers

**[DONE]** Added `security_headers_middleware` in `backend/main.py`, applied to every response (not just `/api/*`) using the exact header set sketched below, plus `frame-ancestors 'none'` on the CSP. CSP is in report-only mode as recommended -- watch the browser console for violations (Vite build, Plaid Link, Face ID/WebAuthn) before flipping it to enforcing.

None of CSP, `Strict-Transport-Security`, `X-Content-Type-Options`,
`X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, or
`Permissions-Policy` are currently set anywhere in `backend/main.py`. Add a
small middleware:

```python
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response
```

CSP is the one that takes real tuning (it has to allow your Vite build's
inline styles/scripts, Tailwind, Plaid Link's iframe/popup, WebAuthn, etc.)
— start in report-only mode:

```python
response.headers["Content-Security-Policy-Report-Only"] = (
    "default-src 'self'; "
    "connect-src 'self' https://production.plaid.com https://sandbox.plaid.com; "
    "frame-src https://cdn.plaid.com; "
    "img-src 'self' data:; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'"
)
```

watch the browser console for violations for a week or two, then flip it to
enforcing (`Content-Security-Policy`) once it's quiet. `X-Frame-Options:
DENY` plus a CSP `frame-ancestors 'none'` is worth having even as a
single-user app — it's what stops Ledger from being iframed into a
clickjacking page that tricks you into clicking "Unlock" or "Log out" while
looking at something else.

If Cloudflare sits in front of production (implied by the Cloudflare-aware
comments in `routers/plaid.py` about 502/504 codes), some of these headers
can also be set at the Cloudflare edge (Transform Rules) as a second layer,
but set them at the app too — don't rely solely on the CDN.

## 7. File upload hardening

**[DONE]** Added `backend/services/upload_limits.py` (`read_upload_within_limit`), used by both `routers/upload.py` (CSV) and `routers/income.py` (paystub PDF). Fast-rejects via `Content-Length` when present, and hard-caps the actual read at `MAX_UPLOAD_BYTES` (env-configurable, defaults to 10 MB) either way. Reverse-proxy-level limits are still worth adding separately if/when one sits in front of this.

`routers/upload.py`'s `upload_csv` reads the entire file into memory
(`await file.read()`) with no size cap, then hands it to `pandas.read_csv`.
`pdfplumber` (used elsewhere for paystub parsing, per `requirements.txt`) is
similarly uncapped. A large or maliciously crafted file (e.g. a CSV with
millions of rows, or a PDF crafted to be slow to parse) could exhaust memory
or CPU on the EC2 instance.

- Add an explicit size check before reading: reject anything over a
  reasonable ceiling (e.g. 10 MB) with a 413, using
  `request.headers.get("content-length")` as a fast pre-check and a hard
  cap while streaming as the real enforcement.
- Consider setting `client_max_body_size`-equivalent limits at the reverse
  proxy layer too (uvicorn itself doesn't cap body size by default).
- Validate the uploaded filename/content-type loosely (you already infer
  structure from parsing, which is good — don't add a fragile extension
  allowlist that just annoys legitimate `.csv`/`.CSV`/`.txt` exports), but
  do reject obviously wrong types (e.g. a 50 MB `.exe` renamed to `.csv`)
  before spending CPU on `pandas.read_csv`.

## 8. Secrets & configuration management

Mostly solid already: confirmed `.env`/`.env.local` are in `.gitignore`,
`config.py` correctly
prefers real environment variables over `.env` (`override=False`), Plaid
access tokens are Fernet-encrypted at rest (`services/crypto.py`) with the
key kept out of the database and out of git. A few additions:

- **`API_KEY` strength.** Nothing currently enforces that the production
  `API_KEY` is long/random. Since this is your only line of defense against
  #1 above, generate it the same way you generate
  `PLAID_TOKEN_ENCRYPTION_KEY` (`python -c "import secrets;
  print(secrets.token_urlsafe(32))"`) rather than a memorable password, and
  store it in a password manager, not just on the EC2 host.
- **Key rotation story.** There's no documented way to rotate `API_KEY` or
  `PLAID_TOKEN_ENCRYPTION_KEY` without downtime/re-linking. Not urgent for
  a personal box, but worth a paragraph in the README next to the existing
  Plaid setup docs so future-you isn't reverse-engineering it during an
  incident.
- **`.env.example` hygiene.** Good as-is — no real secrets committed, only
  placeholders and generation commands.

## 9. Dependency & supply-chain hygiene

**[DONE]** `Dockerfile` now creates and switches to a non-root `appuser`, with its UID/GID pinned to 1000 (deterministic across rebuilds, rather than left to whatever `useradd` happens to pick). Once `server-deploy.sh` was added to this repo, the bind-mount risk flagged here initially was confirmed real: `-v ~/ledger/user_data:/data` with no `--user` flag on `docker run` means every container up to this point ran as root, so the live `charges.db` and everything else under `~/ledger/user_data` was root-owned on the host. `server-deploy.sh` now fixes this itself — before starting the new container, it reads `appuser`'s UID/GID back out of the freshly built image (`docker run --rm ledger id -u/-g appuser`) and `sudo chown -R`s the host's `user_data` directory to match. Runs on every deploy, harmless once ownership is already correct, and self-heals the pre-existing root-owned files no manual step could have caught in advance. Assumes the `ubuntu` EC2 user has passwordless sudo, which is the default on stock Canonical Ubuntu AMIs (the same account already runs `docker` commands directly in this script, implying it's already privileged) — worth a one-time check if that assumption is wrong for this host. Dependency scanning (`pip-audit`/`npm audit`) is still not wired in -- left as a manual/CI follow-up.

- `requirements.txt` pins exact versions (good) but nothing currently
  scans them for known CVEs. Add `pip-audit` (Python) and `npm audit`
  (frontend) as a manual pre-deploy step, or wire them into a GitHub Action
  if/when this repo gets CI.
- **Dockerfile runs as root.** `Dockerfile` never adds a `USER` directive,
  so the container runs the FastAPI process as root inside the image. Add:

  ```dockerfile
  RUN useradd --create-home appuser
  USER appuser
  ```

  after installing dependencies (pip installs need to happen as root or a
  user with write access to site-packages first, then switch down before
  `CMD`). This limits blast radius if a dependency vulnerability or upload
  parsing bug ever leads to code execution inside the container.
- Checked `.dockerignore`: `user_data/`, `.git`, and the Python/Node build
  artifacts are excluded. It doesn't list `.env` explicitly, but that's not
  a live gap — `.env` lives at the repo root and the Dockerfile only ever
  `COPY`s `backend/` and `frontend/` (never the root), so it can't end up in
  the image regardless. No change needed here.

## 10. Plaid webhook trust

**[DONE]** Added `verify_webhook` to `backend/services/plaid_client.py`, following Plaid's documented algorithm: checks the `Plaid-Verification` JWT's signature against a key fetched from Plaid's `/webhook_verification_key/get` (cached by `kid`), rejects anything not signed `ES256`, rejects a JWT older than 5 minutes, and confirms the JWT's `request_body_sha256` claim matches a hash of the *actual* raw request bytes (compared with `hmac.compare_digest`). `routers/plaid.py`'s webhook handler now 401s on any POST that doesn't pass all three checks, before ever parsing the body as JSON. Verified end-to-end against a locally generated EC keypair during implementation (valid/tampered/stale cases all behaved correctly) since this endpoint can't be exercised without a real Plaid account.

Already flagged in your own `PLAID_INTEGRATION_PLAN.md` §6, and called out
in the docstring at `routers/plaid.py`'s `plaid_webhook` — worth repeating
here since it's a real gap: `/api/plaid/webhook` is intentionally
unauthenticated (Plaid's servers can't send `X-API-Key`), and currently
trusts any POST with a matching `item_id` to trigger a resync. Since a
resync just re-pulls from Plaid using your own encrypted access token
(rather than accepting attacker-supplied transaction data), the actual harm
of a forged webhook is limited to wasted API calls / minor DoS against your
Plaid rate limits — not data forgery. Still worth closing per your own plan:
verify Plaid's JWT signature on the webhook (`Plaid-Verification` header)
before acting on it, using `plaid_client`'s existing SDK instance.

## 11. Logging & monitoring

**[DONE, partially]** Auth failures/lockouts (`auth.py`) and general-limiter rejections (`main.py`) now log `logger.warning(...)` with IP + reason (never the attempted key). No alerting infrastructure added, per the original recommendation -- this is `docker logs`/CloudWatch visibility only.

No structured logging currently exists for failed auth attempts. Once rate
limiting (§1) is in place, log each 401/429 with IP + timestamp (not the
attempted key) so a burst of failures is visible in `docker logs`/CloudWatch
without having to add a whole monitoring stack. A single `logger.warning("auth
failure from %s", ip)` line is enough to notice "someone's hammering this"
during a manual log check — you don't need alerting infrastructure for a
personal box, just visibility when you look.

## 12. `/docs` exposure

`ENABLE_DOCS` already defaults off and requires an explicit env var to turn
on (`config.py`) — good default. Just make sure the EC2 production
environment doesn't have `ENABLE_DOCS=1` set (the `.env.example` comment
"show /docs in production" suggests it's sometimes turned on there) —
Swagger UI at `/docs` doesn't leak secrets, but it does hand an attacker a
complete map of every endpoint/schema for free, which pairs badly with #1
until rate limiting exists.

## 13. API key storage in the browser (accepted tradeoff, documented)

`frontend/src/api/client.js` stores the API key in `localStorage`, which
means any successful XSS would expose it. Given this app has no
third-party scripts, a locked-down CSP (§6) makes an XSS foothold hard to
get in the first place, and `localStorage` was a deliberate choice
documented in the code (needed for Face ID quick-unlock to survive app
restarts — see the comment in `client.js` and your own `faceid_quickunlock`
notes). No change recommended here beyond tightening CSP; flagging only so
it's a documented, conscious tradeoff rather than an oversight if this plan
is revisited later.

---

## Suggested order of work

1. Rate limiting + lockout on auth failures (§1) — closes the biggest gap.
2. Security headers + CSP in report-only mode (§6) — cheap, no functional risk.
3. Upload size limits (§7) — cheap, closes a real DoS vector.
4. Docker non-root user (§9) — cheap, one Dockerfile change.
5. Plaid webhook signature verification (§10) — you already scoped this in `PLAID_INTEGRATION_PLAN.md`.
6. CORS method/header narrowing (§4) and CSV export formula-escaping (§3) — low urgency, do whenever you're touching those files anyway.

Already shipped this session: the SPA path-traversal fix, the timing-safe
API key comparison, the login redirect behavior, and the logout route
reset + button rename.
