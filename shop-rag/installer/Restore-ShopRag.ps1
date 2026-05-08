param(
    [Parameter(Mandatory = $true)]
    [string]$BackupZip,
    [string]$InstallRoot = "C:\TerminalAutobody\ShopRag",
    [switch]$RestoreQdrantVolume
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupZip)) {
    throw "Backup zip not found: $BackupZip"
}

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$temp = Join-Path $env:TEMP ("shop-rag-restore-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temp -Force | Out-Null
Expand-Archive -LiteralPath $BackupZip -DestinationPath $temp -Force

Write-Host "Restoring files to $InstallRoot..."
Get-ChildItem -LiteralPath $temp -Force | Copy-Item -Destination $InstallRoot -Recurse -Force

if ($RestoreQdrantVolume) {
    $volumeBackup = Join-Path (Split-Path -Parent $BackupZip) "qdrant_storage.tar.gz"
    if (-not (Test-Path -LiteralPath $volumeBackup)) {
        throw "Qdrant volume backup not found beside backup zip: $volumeBackup"
    }
    docker stop qdrant 2>$null | Out-Null
    docker volume create qdrant_storage | Out-Null
    $backupDir = (Split-Path -Parent $volumeBackup) -replace "\\", "/"
    docker run --rm -v qdrant_storage:/qdrant/storage -v "${backupDir}:/backup" alpine sh -c "rm -rf /qdrant/storage/* && tar xzf /backup/qdrant_storage.tar.gz -C /qdrant/storage"
    docker start qdrant 2>$null | Out-Null
}

Write-Host "Restore complete."
