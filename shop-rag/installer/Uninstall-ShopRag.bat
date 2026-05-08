@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-ShopRag.ps1" %*

echo.
pause
