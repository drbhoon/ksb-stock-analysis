@echo off
echo =====================================================================
echo        KSB TRADING AGENT MICROSERVICE (TauricResearch/TradingAgents)
echo =====================================================================
echo.

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [1/2] Creating isolated Python virtual environment in TradingAgent\.venv...
    python -m venv .venv
    echo [2/2] Installing TradingAgents and FastAPI dependencies...
    .venv\Scripts\python.exe -m pip install --upgrade pip
    .venv\Scripts\pip.exe install -e TradingAgents fastapi uvicorn
)

echo Cleaning up any stale server processes on port 8001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8001 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

echo.
echo ---------------------------------------------------------------------
echo * Launching Trading Agent Microservice on http://127.0.0.1:8001
echo * Provider: Google Gemini (GOOGLE_API_KEY in TradingAgent\.env)
echo ---------------------------------------------------------------------
echo.

.venv\Scripts\python.exe agent_server.py
pause
