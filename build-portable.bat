@echo off
setlocal

cd /d "%~dp0"

echo.
echo ==========================================
echo AI SSH portable package
echo ==========================================
echo.
echo This will build Web package and portable exe package.
echo It will skip the desktop installer bundle.
echo Output:
echo   release\web
echo   release\portable
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\package-release.ps1" -Clean -SkipDesktopInstaller %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo Portable package finished successfully.
  echo.
  echo Portable package:
  echo   %~dp0release\portable
  echo.
  echo Portable zip:
  echo   %~dp0release\ai-ssh-portable-windows-x64.zip
) else (
  echo Portable package failed. Exit code: %EXIT_CODE%
)
echo.
pause
exit /b %EXIT_CODE%
