@echo off
setlocal
cd /d "%~dp0"

echo Starting shop-rag...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run_windows.ps1"

echo.
echo shop-rag has stopped.
pause
