param([string]$ServiceName = "ShopRag")

. "$PSScriptRoot\service_common.ps1"

Assert-Administrator

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    throw "Service '$ServiceName' is not installed."
}

if ($service.Status -eq "Stopped") {
    Write-Host "Service '$ServiceName' is already stopped."
}
else {
    Stop-Service -Name $ServiceName -Force
    Write-Host "Service '$ServiceName' stopped."
}
