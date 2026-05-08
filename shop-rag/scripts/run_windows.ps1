param(
    [string]$HostName = "0.0.0.0",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$VenvActivate = Join-Path $ProjectRoot ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $VenvActivate)) {
    Write-Host "Virtual environment not found. Create it with: python -m venv .venv"
    exit 1
}

. $VenvActivate

if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*#" -or $_ -match "^\s*$") { return }
        $parts = $_ -split "=", 2
        if ($parts.Length -eq 2) {
            [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
        }
    }
}

if ($env:APP_HOST) { $HostName = $env:APP_HOST }
if ($env:APP_PORT) { $Port = [int]$env:APP_PORT }

Write-Host "Starting shop-rag at http://$HostName`:$Port"
python -m uvicorn app.main:app --host $HostName --port $Port
