# ---- Frontend build ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Same-origin API in production — no VITE_API_URL needed.
RUN npm run build

# ---- Production image ----
FROM python:3.12-slim
WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./static

ENV PORT=8000
ENV DATA_DIR=/data

# Run as a non-root user so a dependency vulnerability or upload-parsing bug
# can't lead to root-level code execution inside the container (see
# SECURITY_HARDENING_PLAN.md §9). Created after installing deps/copying
# files (which need root to write into site-packages and /app), and given
# ownership of /data so it can still write the SQLite DB/settings there at
# runtime.
#
# UID/GID are pinned to 1000 (rather than left to whatever useradd picks)
# so they're deterministic across rebuilds -- server-deploy.sh reads this
# same UID back out of the built image and chowns the host's bind-mounted
# ~/ledger/user_data to match before starting the container, so this stays
# correct regardless of what UID the host's `ubuntu` user happens to be.
RUN groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid appuser --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /data /app/backend
USER appuser

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
