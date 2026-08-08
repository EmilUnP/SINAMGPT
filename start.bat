@echo off
setlocal
cd /d "%~dp0"

set PORT=3000

echo.
echo === SINAMGPT restart ===
echo Killing anything on port %PORT%...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  echo   Stopping PID %%a
  taskkill /PID %%a /F >nul 2>&1
)

timeout /t 1 /nobreak >nul

echo Starting app...
echo Open http://localhost:%PORT%
echo.

call npm run dev

endlocal
