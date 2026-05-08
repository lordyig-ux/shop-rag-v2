param(
    [string]$ServiceName = "ShopRag",
    [string]$NssmPath = ""
)

. "$PSScriptRoot\service_common.ps1"

Assert-Administrator

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    Write-Host "Service '$ServiceName' is not installed."
    exit 0
}

if ($service.Status -ne "Stopped") {
    Write-Host "Stopping service '$ServiceName'..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    $service.WaitForStatus("Stopped", "00:00:30")
}

try {
    $Nssm = Resolve-NssmPath -NssmPath $NssmPath
    Write-Host "Removing service '$ServiceName' with NSSM..."
    & $Nssm remove $ServiceName confirm | Out-Null
}
catch {
    Write-Host "NSSM was not found, using sc.exe delete instead."
    sc.exe delete $ServiceName | Out-Null
}

Write-Host "Service '$ServiceName' removed."
