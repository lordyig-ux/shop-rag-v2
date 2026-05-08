@echo off
setlocal
cd /d "%~dp0"

echo Restarting shop-rag...
echo.
echo Stopping anything currently using port 8000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$listeners = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; foreach ($listener in $listeners) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo.
echo Starting shop-rag...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run_windows.ps1"

echo.
echo shop-rag has stopped.
pause
