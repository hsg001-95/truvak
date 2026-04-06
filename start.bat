@echo off
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   TRUST INTELLIGENCE PLATFORM           ║
echo  ║   Starting core services...             ║
echo  ╚══════════════════════════════════════════╝
echo.

echo  [1/3] Starting FastAPI backend on port 8000...
start "Trust API" cmd /k "cd /d %~dp0 && venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000"

timeout /t 3 /nobreak > nul

echo  [2/3] Starting Customer app on port 5174...
start "Trust Customer App" cmd /k "cd /d %~dp0customer && npm run dev"

timeout /t 2 /nobreak > nul

echo  [3/3] Starting ngrok tunnel on port 8000...
start "Trust ngrok" cmd /k "cd /d %~dp0 && ngrok http 8000"

timeout /t 3 /nobreak > nul

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   All services started!                 ║
echo  ║                                         ║
echo  ║   API      : http://127.0.0.1:8000      ║
echo  ║   API Docs : http://127.0.0.1:8000/docs ║
echo  ║   Customer : http://127.0.0.1:5174      ║
echo  ║   ngrok UI : http://127.0.0.1:4040      ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Note: Run npm install once in customer/ before first launch.
echo.
pause