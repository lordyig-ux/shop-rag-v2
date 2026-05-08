$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $Python)) {
    Write-Error "Missing virtual environment Python at $Python"
    exit 1
}

$HostName = "0.0.0.0"
$Port = 8000
$EnvFile = Join-Path $ProjectRoot ".env"
if (Test-Path -LiteralPath $EnvFile) {
    Get-Content -LiteralPath $EnvFile | ForEach-Object {
        if ($_ -match "^\s*#" -or $_ -match "^\s*$" -or $_ -notmatch "=") { return }
        $parts = $_ -split "=", 2
        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

if ($env:APP_HOST) { $HostName = $env:APP_HOST }
if ($env:APP_PORT) { $Port = [int]$env:APP_PORT }

Write-Host "Starting shop-rag service at http://$HostName`:$Port"
& $Python -m uvicorn app.main:app --host $HostName --port $Port
exit $LASTEXITCODE
