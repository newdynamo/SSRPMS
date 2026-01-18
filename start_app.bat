@echo off
echo Starting SSRPMS Execution...

:: Pre-clean ports to avoid conflicts
echo Cleaning up existing processes...
call npx.cmd -y kill-port 8500 3500
timeout /t 2 /nobreak >nul

:: Start Backend
echo Starting Backend Server (Port 8500)...
start "SSRPMS Backend" cmd /k "cd backend && npm.cmd start"

:: Wait a moment for backend to initialize
timeout /t 3 /nobreak >nul

:: Start Frontend
echo Starting Frontend Client (Port 3500)...
start "SSRPMS Frontend" cmd /k "cd frontend && npm.cmd run dev -- --port 3500"

:: Wait for Frontend to spin up
timeout /t 5 /nobreak >nul

:: Open Browser (Default)
echo Opening Browser...
start "" "http://localhost:3500"

echo.
echo Application launched!
echo Frontend: http://localhost:3500
echo Backend: http://localhost:8500
echo.
pause
