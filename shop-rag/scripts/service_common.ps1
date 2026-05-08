$ErrorActionPreference = "Stop"

$Script:ProjectRoot = Split-Path -Parent $PSScriptRoot
$Script:DefaultServiceName = "ShopRag"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script from PowerShell as Administrator."
    }
}

function Resolve-NssmPath {
    param([string]$NssmPath = "")

    $candidates = @()
    if ($NssmPath) {
        $candidates += $NssmPath
    }
    if ($env:NSSM_PATH) {
        $candidates += $env:NSSM_PATH
    }
    $candidates += (Join-Path $Script:ProjectRoot "tools\nssm\nssm.exe")

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    $command = Get-Command "nssm.exe" -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    throw @"
NSSM was not found.

Install NSSM first, then rerun this script.

Recommended folder:
  $Script:ProjectRoot\tools\nssm\nssm.exe

Download:
  https://nssm.cc/download

You can also pass the path manually:
  .\scripts\install_service.ps1 -NssmPath C:\Tools\nssm\nssm.exe
"@
}

function Assert-ShopRagPrerequisites {
    $python = Join-Path $Script:ProjectRoot ".venv\Scripts\python.exe"
    $envFile = Join-Path $Script:ProjectRoot ".env"
    $appMain = Join-Path $Script:ProjectRoot "app\main.py"

    if (-not (Test-Path -LiteralPath $python)) {
        throw "Missing .venv. Create it first: py -3.11 -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt"
    }
    if (-not (Test-Path -LiteralPath $envFile)) {
        throw "Missing .env. Copy .env.example to .env and fill in production settings first."
    }
    if (-not (Test-Path -LiteralPath $appMain)) {
        throw "Cannot find app\main.py. Run this from the shop-rag project folder."
    }
}

function Get-ShopRagEnvValue {
    param(
        [string]$Name,
        [string]$DefaultValue = ""
    )

    $envFile = Join-Path $Script:ProjectRoot ".env"
    if (-not (Test-Path -LiteralPath $envFile)) {
        return $DefaultValue
    }

    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match "^\s*#" -or $line -match "^\s*$" -or $line -notmatch "=") {
            continue
        }
        $parts = $line -split "=", 2
        if ($parts[0].Trim() -ieq $Name) {
            $value = $parts[1].Trim()
            if ($value) {
                return $value
            }
        }
    }

    return $DefaultValue
}

function Get-ShopRagServiceUrl {
    $port = Get-ShopRagEnvValue -Name "APP_PORT" -DefaultValue "8000"
    return "http://127.0.0.1:$port"
}
