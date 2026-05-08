param(
    [string]$InstallRoot = "C:\TerminalAutobody\ShopRag",
    [string]$ServiceName = "ShopRag",
    [switch]$RemoveFiles,
    [switch]$StopQdrant
)

$ErrorActionPreference = "Stop"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script as Administrator."
    }
}

Assert-Administrator

$projectRoot = Join-Path $InstallRoot "shop-rag"
$uninstallScript = Join-Path $projectRoot "scripts\uninstall_service.ps1"
if (Test-Path -LiteralPath $uninstallScript) {
    & $uninstallScript -ServiceName $ServiceName
}
else {
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service) {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $ServiceName | Out-Null
    }
}

if ($StopQdrant) {
    docker stop qdrant 2>$null | Out-Null
}

if ($RemoveFiles) {
    if (Test-Path -LiteralPath $InstallRoot) {
        Remove-Item -LiteralPath $InstallRoot -Recurse -Force
        Write-Host "Removed install folder: $InstallRoot"
    }
}
else {
    Write-Host "Application files were left in place: $InstallRoot"
    Write-Host "Use -RemoveFiles only after you have a backup."
}
