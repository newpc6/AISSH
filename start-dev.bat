@echo off
setlocal

if /i "%~1"=="/?" goto :help
if /i "%~1"=="--help" goto :help

cd /d "%~dp0"

echo [AI SSH] Starting Go core in a separate log window...
start "AI SSH Core Logs" cmd /k "cd /d ""%~dp0"" && npm run dev:core"

echo [AI SSH] Starting Tauri desktop without auto-starting another core...
npm run dev:tauri

if errorlevel 1 (
  echo.
  echo [AI SSH] Tauri exited with an error. Check the output above and the core log window.
  pause
)

endlocal
exit /b 0

:help
echo AI SSH development launcher
echo.
echo Double click this file to:
echo   1. open Go core in a separate visible log window
echo   2. start Tauri desktop with AI_SSH_DESKTOP_NO_CORE=1
echo.
echo Usage:
echo   start-dev.bat
echo.
endlocal
exit /b 0
