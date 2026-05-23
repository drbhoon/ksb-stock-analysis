@echo off
echo =====================================================================
echo           BOOTSTRAPPING KSB GENERAL STOCK ANALYSIS APPLICATION
echo =====================================================================
echo.
echo [1/3] Verifying development environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH. Please install Python 3.10+
    pause
    exit /b 1
)

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH. Please install Node.js v18+
    pause
    exit /b 1
)

echo [2/3] Checking backend requirements...
pip install -r backend\requirements.txt

echo.
echo [3/3] Launching servers...
echo.
echo ---------------------------------------------------------------------
echo * Launching FastAPI Backend on http://127.0.0.1:8000
echo * Launching React Vite Frontend on http://localhost:5173
echo ---------------------------------------------------------------------
echo.
echo [INFO] Close the terminal windows to shut down the servers.
echo.

:: Launch backend in a new cmd window
start "KSB Stock Analysis - FastAPI Backend" cmd /c "title FastAPI Backend && cd backend && python main.py"

:: Launch frontend in a new cmd window
start "KSB Stock Analysis - Vite Frontend" cmd /c "title Vite React Frontend && cd frontend && npm run dev"

echo Startup command triggered successfully!
echo Opening browser...
start http://localhost:5173

pause
