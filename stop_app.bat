@echo off
echo Stopping SSRPMS Application...


:: Kill Backend Port
echo Killing Backend (Port 8500)...
call npx.cmd -y kill-port 8500

:: Kill Frontend Ports (Cleaning up all potential ports used during debug)
echo Killing Frontend (Ports 3500-3510)...
call npx.cmd -y kill-port 3500 3501 3502 3503 3504 3505 3506 3507 3508 3509 3510

:: Close Terminal Windows
echo Closing Terminal Windows...
taskkill /FI "WINDOWTITLE eq SSRPMS Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SSRPMS Frontend*" /T /F >nul 2>&1

echo.
echo Application stopped and ports cleaned.
pause
