param([string]$ServiceName = "ShopRag")

. "$PSScriptRoot\service_common.ps1"

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    Write-Host "Service '$ServiceName' is not installed."
    exit 1
}

Write-Host "Service: $ServiceName"
Write-Host "Status:  $($service.Status)"
Write-Host "Start:   $($service.StartType)"

$url = Get-ShopRagServiceUrl
try {
    $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 10
    Write-Host "Health:  $($health.status)"
    Write-Host "Qdrant:  connected=$($health.qdrant.connected)"
    Write-Host "Provider: $($health.answer_provider)"
}
catch {
    Write-Host "Health:  not reachable at $url/api/health"
    Write-Host "Detail:  $($_.Exception.Message)"
}
