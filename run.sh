#!/usr/bin/env bash
# Budget App launcher for macOS/Linux.
# Installs dependencies on first run, then starts both the backend and frontend.
set -e
cd "$(dirname "$0")"

if [ ! -d "backend/.venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv backend/.venv
fi

echo "Installing backend dependencies..."
backend/.venv/bin/pip install -q -r backend/requirements.txt

if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies, this may take a minute..."
  (cd frontend && npm install)
fi

cleanup() {
  echo "Stopping servers..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
}
trap cleanup EXIT

echo "Starting backend on http://localhost:8000"
(cd backend && ../backend/.venv/bin/uvicorn main:app --reload --port 8000) &
BACKEND_PID=$!

sleep 2

echo "Starting frontend on http://localhost:5173"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

wait
