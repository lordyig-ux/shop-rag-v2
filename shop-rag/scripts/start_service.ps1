param([string]$ServiceName = "ShopRag")

. "$PSScriptRoot\service_common.ps1"

Assert-Administrator

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    throw "Service '$ServiceName' is not installed."
}

if ($service.Status -eq "Running") {
    Write-Host "Service '$ServiceName' is already running."
}
else {
    Start-Service -Name $ServiceName
    Write-Host "Service '$ServiceName' started."
}

& "$PSScriptRoot\service_status.ps1" -ServiceName $ServiceName
