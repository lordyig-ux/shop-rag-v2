param(
    [string]$OutputDir = "",
    [switch]$IncludeEnv,
    [switch]$NoZip
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkspaceRoot = Split-Path -Parent $ProjectRoot
if (-not $OutputDir) {
    $OutputDir = Join-Path $WorkspaceRoot "dist"
}

function Copy-DirectoryFiltered {
    param(
        [string]$Source,
        [string]$Destination,
        [string[]]$ExcludePatterns
    )

    $sourceRoot = (Resolve-Path -LiteralPath $Source).Path
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null

    Get-ChildItem -LiteralPath $sourceRoot -Recurse -Force | ForEach-Object {
        $relative = $_.FullName.Substring($sourceRoot.Length).TrimStart("\")
        $normalized = $relative -replace "\\", "/"
        foreach ($pattern in $ExcludePatterns) {
            if ($normalized -like $pattern) {
                return
            }
        }

        $target = Join-Path $Destination $relative
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Path $target -Force | Out-Null
        }
        else {
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $target -Force
        }
    }
}

function Copy-FileRequired {
    param(
        [string]$Source,
        [string]$Destination
    )
    if (-not (Test-Path -LiteralPath $Source)) {
        throw "Required file not found: $Source"
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bundleName = "TerminalAutobody-ShopRag-Production-$timestamp"
$bundleRoot = Join-Path $OutputDir $bundleName
$payloadRoot = Join-Path $bundleRoot "payload\ICBC_Scraper"

if (Test-Path -LiteralPath $bundleRoot) {
    Remove-Item -LiteralPath $bundleRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null

Write-Host "Building production bundle:"
Write-Host $bundleRoot

Copy-FileRequired -Source (Join-Path $WorkspaceRoot "extract_links.py") -Destination (Join-Path $payloadRoot "extract_links.py")
Copy-FileRequired -Source (Join-Path $WorkspaceRoot "scrape_procedures.py") -Destination (Join-Path $payloadRoot "scrape_procedures.py")
Copy-FileRequired -Source (Join-Path $WorkspaceRoot "process_chunks.py") -Destination (Join-Path $payloadRoot "process_chunks.py")

Copy-DirectoryFiltered `
    -Source (Join-Path $WorkspaceRoot "output") `
    -Destination (Join-Path $payloadRoot "output") `
    -ExcludePatterns @("vectordb", "vectordb/*")

$shopRagExcludes = @(
    ".venv",
    ".venv/*",
    ".pytest_cache",
    ".pytest_cache/*",
    "__pycache__",
    "*/__pycache__",
    "*/__pycache__/*",
    "*.pyc",
    "tests",
    "tests/*",
    "installer",
    "installer/*",
    "dist",
    "dist/*",
    "data/logs",
    "data/logs/*",
    "data/jobs",
    "data/jobs/*"
)
if (-not $IncludeEnv) {
    $shopRagExcludes += ".env"
}

Copy-DirectoryFiltered `
    -Source $ProjectRoot `
    -Destination (Join-Path $payloadRoot "shop-rag") `
    -ExcludePatterns $shopRagExcludes

Copy-DirectoryFiltered `
    -Source (Join-Path $ProjectRoot "installer") `
    -Destination $bundleRoot `
    -ExcludePatterns @()

$manifest = @"
Terminal Autobody shop-rag production bundle
Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Source workspace: $WorkspaceRoot
Includes .env: $IncludeEnv

Payload:
  payload\ICBC_Scraper

Install:
  Right-click Install-ShopRag.bat and choose Run as administrator.
"@
Set-Content -LiteralPath (Join-Path $bundleRoot "bundle-manifest.txt") -Value $manifest -Encoding UTF8

if (-not $NoZip) {
    $zipPath = Join-Path $OutputDir "$bundleName.zip"
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    Compress-Archive -LiteralPath $bundleRoot -DestinationPath $zipPath -Force
    Write-Host ""
    Write-Host "Bundle zip created:"
    Write-Host $zipPath
}

Write-Host ""
Write-Host "Bundle folder created:"
Write-Host $bundleRoot
