param(
    [ValidateSet('quick', 'soak')][string] $Mode = 'quick',
    [ValidatePattern('^[1-9][0-9]*[smh]$')][string] $SoakDuration = '30m',
    [switch] $NoCatalogCache,
    [switch] $KeepRunning
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$settings = @{
    DOCKER_DB_NAME = 'wasla_load_test'
    GATEWAY_PORT = '5051'
    LOAD_JWT_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    LOAD_JWT_REFRESH_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    LOAD_CACHE_URL = $(if ($NoCatalogCache) { '' } else { 'redis://catalog-cache:6379' })
    LOAD_PASSWORD = [guid]::NewGuid().ToString('N')
    RUN_ID = [guid]::NewGuid().ToString('N')
    MODE = $Mode
    SOAK_DURATION = $SoakDuration
    STORE_ID = $null
    PRODUCT_ID = $null
}
$previous = @{}
foreach ($name in $settings.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
}
# PowerShell can remove empty environment variables. A disabled URL explicitly bypasses Redis.
if ($NoCatalogCache) { $env:LOAD_CACHE_URL = 'disabled' }
$compose = @('compose', '-p', 'wasla-perf', '-f', 'compose.yaml', '-f', 'compose.load.yaml')
function Invoke-Compose {
    & docker @compose @args
    if ($LASTEXITCODE -ne 0) { throw "Benchmark Compose command failed with exit code $LASTEXITCODE" }
}
Push-Location $projectRoot
try {
    Invoke-Compose up --build -d --scale api=2 --wait --wait-timeout 120
    $fixture = Invoke-Compose exec -T -e LOAD_PASSWORD api node load/fixture.cjs | ConvertFrom-Json
    $env:STORE_ID = $fixture.storeId.ToString()
    $env:PRODUCT_ID = $fixture.productId.ToString()
    Write-Output ($fixture | ConvertTo-Json -Compress)
    if (!$NoCatalogCache) { Invoke-Compose exec -T api node load/fixture.cjs profile }
    Invoke-Compose --profile load run --no-deps --rm -e LOAD_PASSWORD -e RUN_ID -e STORE_ID -e PRODUCT_ID -e MODE -e SOAK_DURATION k6 run --quiet /scripts/catalog.js
} finally {
    try {
        if (!$KeepRunning) { Invoke-Compose down }
    } finally {
        Pop-Location
        foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    }
}
