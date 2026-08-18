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

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
