@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Backup-ShopRag.ps1" %*

echo.
pause
