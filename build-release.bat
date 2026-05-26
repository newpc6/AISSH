@echo off
setlocal

cd /d "%~dp0"

echo.
echo ==========================================
echo AI SSH release package
echo ==========================================
echo.
echo This will build Web package, desktop installer, and portable exe package.
echo Output:
echo   release\web
echo   release\desktop
echo   release\portable
echo.
echo If an old installer file is occupied, close Explorer/installer windows
echo or run: powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -SkipDesktopInstaller
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\package-release.ps1" -Clean %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo Package finished successfully.
  echo.
  echo Web package:
  echo   %~dp0release\web
  echo.
  echo Desktop package:
  echo   %~dp0release\desktop
  echo.
  echo Portable package:
  echo   %~dp0release\portable
) else (
  echo Package failed. Exit code: %EXIT_CODE%
)
echo.
pause
exit /b %EXIT_CODE%
