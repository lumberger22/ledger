@echo off
REM Budget App launcher for Windows.
REM Double-click this file (or run it from a terminal) to install
REM dependencies on first run and start both the backend and frontend.

setlocal
cd /d "%~dp0"

if not exist "backend\.venv" (
    echo Creating Python virtual environment...
    python -m venv backend\.venv
)

echo Installing backend dependencies...
backend\.venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies, this may take a minute...
    pushd frontend
    call npm install
    popd
)

echo.
echo Starting backend on http://localhost:8000 and frontend on http://localhost:5173
echo Close this window to stop both servers.
echo.

start "Budget App - Backend" cmd /k "cd /d "%~dp0backend" && ..\backend\.venv\Scripts\uvicorn.exe main:app --reload --port 8000"
timeout /t 2 /nobreak >nul
start "Budget App - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

endlocal
