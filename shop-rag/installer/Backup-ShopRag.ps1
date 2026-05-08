param(
    [string]$InstallRoot = "C:\TerminalAutobody\ShopRag",
    [string]$BackupRoot = "C:\TerminalAutobody\ShopRagBackups",
    [switch]$IncludeQdrantVolume
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $BackupRoot "shop-rag-backup-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$zipPath = Join-Path $backupDir "shop-rag-files.zip"
$paths = @(
    Join-Path $InstallRoot "output",
    Join-Path $InstallRoot "extract_links.py",
    Join-Path $InstallRoot "scrape_procedures.py",
    Join-Path $InstallRoot "process_chunks.py",
    Join-Path $InstallRoot "shop-rag\.env",
    Join-Path $InstallRoot "shop-rag\data",
    Join-Path $InstallRoot "shop-rag\QDRANT_INSPECTION_REPORT.md"
) | Where-Object { Test-Path -LiteralPath $_ }

Compress-Archive -LiteralPath $paths -DestinationPath $zipPath -Force
Write-Host "File backup created:"
Write-Host $zipPath

if ($IncludeQdrantVolume) {
    $docker = Get-Command "docker.exe" -ErrorAction SilentlyContinue
    if (-not $docker) {
        Write-Host "Docker not found. Skipping Qdrant volume backup."
    }
    else {
        $backupMount = $backupDir -replace "\\", "/"
        Write-Host "Backing up Docker volume qdrant_storage..."
        docker run --rm -v qdrant_storage:/qdrant/storage -v "${backupMount}:/backup" alpine sh -c "cd /qdrant/storage && tar czf /backup/qdrant_storage.tar.gz ."
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Qdrant volume backup created:"
            Write-Host (Join-Path $backupDir "qdrant_storage.tar.gz")
        }
        else {
            Write-Host "Qdrant volume backup failed. File backup is still available."
        }
    }
}

Write-Host ""
Write-Host "Backup folder:"
Write-Host $backupDir
