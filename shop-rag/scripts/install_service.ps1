param(
    [string]$ServiceName = "ShopRag",
    [string]$NssmPath = "",
    [switch]$NoStart
)

. "$PSScriptRoot\service_common.ps1"

Assert-Administrator
Assert-ShopRagPrerequisites
$Nssm = Resolve-NssmPath -NssmPath $NssmPath

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    throw "Service '$ServiceName' already exists. Use scripts\uninstall_service.ps1 first if you need to reinstall it."
}

$logsDir = Join-Path $Script:ProjectRoot "data\logs"
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

$powerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$runner = Join-Path $Script:ProjectRoot "scripts\run_service.ps1"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""

Write-Host "Installing Windows service '$ServiceName'..."
& $Nssm install $ServiceName $powerShell | Out-Null
& $Nssm set $ServiceName AppParameters $arguments | Out-Null
& $Nssm set $ServiceName AppDirectory $Script:ProjectRoot | Out-Null
& $Nssm set $ServiceName DisplayName "Terminal Autobody shop-rag" | Out-Null
& $Nssm set $ServiceName Description "Local LAN knowledge-base dashboard for Terminal Autobody." | Out-Null
& $Nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
& $Nssm set $ServiceName AppStdout (Join-Path $logsDir "service-output.log") | Out-Null
& $Nssm set $ServiceName AppStderr (Join-Path $logsDir "service-error.log") | Out-Null
& $Nssm set $ServiceName AppRotateFiles 1 | Out-Null
& $Nssm set $ServiceName AppRotateOnline 1 | Out-Null
& $Nssm set $ServiceName AppRotateBytes 10485760 | Out-Null
& $Nssm set $ServiceName AppThrottle 15000 | Out-Null
& $Nssm set $ServiceName AppRestartDelay 10000 | Out-Null

$dockerService = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
if ($dockerService) {
    & $Nssm set $ServiceName DependOnService "com.docker.service" | Out-Null
    Write-Host "Added dependency on Docker Desktop service: com.docker.service"
}

sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null

Write-Host "Service installed."
Write-Host "Service name: $ServiceName"
Write-Host "Logs:"
Write-Host "  $(Join-Path $logsDir "service-output.log")"
Write-Host "  $(Join-Path $logsDir "service-error.log")"

if (-not $NoStart) {
    Write-Host "Starting service..."
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 3
    & "$PSScriptRoot\service_status.ps1" -ServiceName $ServiceName
}
