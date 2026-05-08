@echo off
setlocal
cd /d "%~dp0"

echo Terminal Autobody shop-rag production installer
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-ShopRag.ps1" %*

echo.
pause
