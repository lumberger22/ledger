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
# NOTE: if /data is bind-mounted from the EC2 host (check server-deploy.sh),
# this chown only affects the image layer, not a host-mounted volume's
# actual ownership -- the host directory may need `chown 1000:1000` (or
# whatever UID useradd assigns) so the container can still write to it after
# this change ships. Check with `docker exec <container> id appuser` and
# `ls -ln` on the host path.
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /data /app/backend
USER appuser

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
