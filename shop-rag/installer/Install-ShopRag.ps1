param(
    [string]$InstallRoot = "C:\TerminalAutobody\ShopRag",
    [int]$Port = 8000,
    [string]$ServiceName = "ShopRag",
    [string]$OllamaBaseUrl = "https://ollama.com",
    [string]$OllamaModel = "gpt-oss:120b",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run Install-ShopRag.bat as Administrator."
    }
}

function Convert-SecureStringToPlainText {
    param([Security.SecureString]$Value)
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

function Read-RequiredSecret {
    param([string]$Prompt)
    while ($true) {
        $secure = Read-Host $Prompt -AsSecureString
        $plain = Convert-SecureStringToPlainText $secure
        if ($plain.Trim()) {
            return $plain.Trim()
        }
        Write-Host "This value is required."
    }
}

function Get-PythonCommand {
    $py = Get-Command "py.exe" -ErrorAction SilentlyContinue
    if ($py) {
        $version = & py -3.11 --version 2>$null
        if ($LASTEXITCODE -eq 0 -and $version -match "Python 3\.1[1-9]") {
            return "py -3.11"
        }
    }

    $python = Get-Command "python.exe" -ErrorAction SilentlyContinue
    if ($python) {
        $version = & python --version 2>$null
        if ($LASTEXITCODE -eq 0 -and $version -match "Python 3\.(1[1-9]|[2-9][0-9])") {
            return "python"
        }
    }

    throw "Python 3.11 or newer was not found. Install Python from https://www.python.org/downloads/windows/ and enable Add Python to PATH."
}

function Set-EnvValue {
    param(
        [string]$EnvPath,
        [string]$Name,
        [string]$Value
    )

    $lines = @()
    if (Test-Path -LiteralPath $EnvPath) {
        $lines = @(Get-Content -LiteralPath $EnvPath)
    }

    $found = $false
    $updated = foreach ($line in $lines) {
        if ($line -match "^\s*$([Regex]::Escape($Name))\s*=") {
            $found = $true
            "$Name=$Value"
        }
        else {
            $line
        }
    }

    if (-not $found) {
        $updated += "$Name=$Value"
    }

    Set-Content -LiteralPath $EnvPath -Value $updated -Encoding UTF8
}

function Wait-HttpOk {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            Invoke-RestMethod -Uri $Url -TimeoutSec 5 | Out-Null
            return
        }
        catch {
            Start-Sleep -Seconds 2
        }
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for $Url"
}

function Ensure-DockerAndQdrant {
    $docker = Get-Command "docker.exe" -ErrorAction SilentlyContinue
    if (-not $docker) {
        throw "Docker was not found. Install Docker Desktop first, then run this installer again."
    }

    docker info | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker is installed but not running. Start Docker Desktop, wait until it is ready, then run this installer again."
    }

    docker volume create qdrant_storage | Out-Null
    $existing = docker ps -a --filter "name=^/qdrant$" --format "{{.Names}}"
    if ($existing -eq "qdrant") {
        docker update --restart unless-stopped qdrant | Out-Null
        docker start qdrant | Out-Null
    }
    else {
        docker run -d --name qdrant --restart unless-stopped `
            -p 127.0.0.1:6333:6333 `
            -p 127.0.0.1:6334:6334 `
            -v qdrant_storage:/qdrant/storage `
            qdrant/qdrant | Out-Null
    }

    Wait-HttpOk -Url "http://127.0.0.1:6333/collections" -TimeoutSeconds 90
}

function Ensure-Nssm {
    param(
        [string]$ProjectRoot,
        [string]$BundleRoot
    )

    $target = Join-Path $ProjectRoot "tools\nssm\nssm.exe"
    if (Test-Path -LiteralPath $target) {
        return $target
    }

    $bundleNssm = Join-Path $BundleRoot "tools\nssm\nssm.exe"
    if (Test-Path -LiteralPath $bundleNssm) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $bundleNssm -Destination $target -Force
        return $target
    }

    Write-Host "NSSM not found. Downloading NSSM service wrapper..."
    $temp = Join-Path $env:TEMP ("nssm-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $temp -Force | Out-Null
    $zip = Join-Path $temp "nssm.zip"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip
    Expand-Archive -LiteralPath $zip -DestinationPath $temp -Force
    $candidate = Get-ChildItem -LiteralPath $temp -Recurse -Filter "nssm.exe" |
        Where-Object { $_.FullName -match "\\win64\\" } |
        Select-Object -First 1
    if (-not $candidate) {
        throw "NSSM download did not contain win64\nssm.exe. Download it manually from https://nssm.cc/download."
    }

    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath $candidate.FullName -Destination $target -Force
    return $target
}

function Get-QdrantCollectionNames {
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:6333/collections" -TimeoutSec 10
        return @($response.result.collections | ForEach-Object { $_.name })
    }
    catch {
        return @()
    }
}

Assert-Administrator

$BundleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PayloadRoot = Join-Path $BundleRoot "payload\ICBC_Scraper"
if (-not (Test-Path -LiteralPath $PayloadRoot)) {
    throw "Installer payload not found: $PayloadRoot"
}

Write-Host "Terminal Autobody shop-rag production installer"
Write-Host "Install folder: $InstallRoot"
Write-Host ""

$adminPassword = Read-RequiredSecret -Prompt "Enter the shop-rag admin password"
$ollamaApiKey = Read-RequiredSecret -Prompt "Enter the Ollama API key"

if ((Test-Path -LiteralPath $InstallRoot) -and (Get-ChildItem -LiteralPath $InstallRoot -Force -ErrorAction SilentlyContinue) -and -not $Force) {
    throw "Install folder already exists and is not empty. Use -Force only after backing up the existing install."
}

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
Write-Host "Copying application files..."
Get-ChildItem -LiteralPath $PayloadRoot -Force | Copy-Item -Destination $InstallRoot -Recurse -Force

$ProjectRoot = Join-Path $InstallRoot "shop-rag"
$envPath = Join-Path $ProjectRoot ".env"
if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath (Join-Path $ProjectRoot ".env.example") -Destination $envPath
}

Set-EnvValue -EnvPath $envPath -Name "APP_ENV" -Value "production"
Set-EnvValue -EnvPath $envPath -Name "APP_HOST" -Value "0.0.0.0"
Set-EnvValue -EnvPath $envPath -Name "APP_PORT" -Value ([string]$Port)
Set-EnvValue -EnvPath $envPath -Name "QDRANT_URL" -Value "http://127.0.0.1:6333"
Set-EnvValue -EnvPath $envPath -Name "QDRANT_COLLECTION" -Value "icbc_procedures"
Set-EnvValue -EnvPath $envPath -Name "ANSWER_PROVIDER" -Value "ollama"
Set-EnvValue -EnvPath $envPath -Name "OLLAMA_BASE_URL" -Value $OllamaBaseUrl
Set-EnvValue -EnvPath $envPath -Name "OLLAMA_MODEL" -Value $OllamaModel
Set-EnvValue -EnvPath $envPath -Name "OLLAMA_API_KEY" -Value $ollamaApiKey
Set-EnvValue -EnvPath $envPath -Name "ADMIN_USERNAME" -Value "admin"
Set-EnvValue -EnvPath $envPath -Name "ADMIN_PASSWORD" -Value $adminPassword
Set-EnvValue -EnvPath $envPath -Name "QUERY_EMBEDDING_MODEL" -Value "all-MiniLM-L6-v2"
Set-EnvValue -EnvPath $envPath -Name "LOCAL_CHUNKS_PATH" -Value "../output/chunks.jsonl"
Set-EnvValue -EnvPath $envPath -Name "SHOP_DOCS_INBOX_PATH" -Value "data/shop_docs/inbox"

Write-Host "Creating Python virtual environment..."
$pythonCommand = Get-PythonCommand
Push-Location $ProjectRoot
try {
    if (-not (Test-Path -LiteralPath ".venv\Scripts\python.exe")) {
        if ($pythonCommand -eq "py -3.11") {
            & py -3.11 -m venv .venv
        }
        else {
            & python -m venv .venv
        }
    }
    & ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
    & ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
}
finally {
    Pop-Location
}

Write-Host "Starting or creating Qdrant..."
Ensure-DockerAndQdrant

Push-Location $ProjectRoot
try {
    $collections = Get-QdrantCollectionNames
    if ($collections -notcontains "icbc_procedures") {
        Write-Host "Importing ICBC knowledge base into Qdrant..."
        & ".\.venv\Scripts\python.exe" "scripts\import_chunks_to_qdrant.py" --collection icbc_procedures --embedding-model all-MiniLM-L6-v2 --recreate
    }
    else {
        Write-Host "ICBC Qdrant collection already exists."
    }

    $collections = Get-QdrantCollectionNames
    $shopInbox = Join-Path $ProjectRoot "data\shop_docs\inbox"
    $hasShopDocs = (Test-Path -LiteralPath $shopInbox) -and [bool](Get-ChildItem -LiteralPath $shopInbox -Recurse -File -ErrorAction SilentlyContinue)
    if ($hasShopDocs -and ($collections -notcontains "shop_docs_v1")) {
        Write-Host "Importing shop documents into Qdrant..."
        & ".\.venv\Scripts\python.exe" "scripts\import_shop_docs_to_qdrant.py"
    }
}
finally {
    Pop-Location
}

$nssm = Ensure-Nssm -ProjectRoot $ProjectRoot -BundleRoot $BundleRoot
Write-Host "Installing shop-rag Windows service..."
& (Join-Path $ProjectRoot "scripts\install_service.ps1") -ServiceName $ServiceName -NssmPath $nssm

$ruleName = "shop-rag FastAPI $Port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
}

Start-Sleep -Seconds 5
$health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 20

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Write-Host "shop-rag installed successfully."
Write-Host "Health: $($health.status)"
Write-Host "Local:   http://127.0.0.1:$Port"
if ($ip) {
    Write-Host "Network: http://$ip`:$Port"
    Write-Host "Admin:   http://$ip`:$Port/admin"
}
Write-Host ""
Write-Host "Service name: $ServiceName"
Write-Host "Install folder: $InstallRoot"
