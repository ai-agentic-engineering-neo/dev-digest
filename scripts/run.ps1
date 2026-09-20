#
# DevDigest quick run - assumes ./scripts/dev.sh (or --db-only) has been run at
# least once so deps are installed and the DB is migrated/seeded. This script
# just brings the stack up for a quick test pass:
#
#   Postgres (docker) -> API (:3001) -> web (:3000) -> open browser
#
# Server and client run in their own PowerShell windows so their logs stay
# visible; close those windows (or Ctrl-C in them) to stop the dev servers.
#
# Usage:  .\scripts\run.ps1
#     or: scripts\run.bat   (thin wrapper around this script)

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Log($msg)  { Write-Host "-> $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "! $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "x $msg" -ForegroundColor Red; exit 1 }

# --- Docker daemon --------------------------------------------------------------
# No stderr redirection here on purpose: with $ErrorActionPreference = "Stop",
# a native command's redirected stderr becomes a terminating error even when
# piped to $null (a Windows PowerShell 5.1 quirk) - so check $LASTEXITCODE
# instead of relying on try/catch or redirects around docker calls.
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "Docker doesn't seem to be running. Start Docker Desktop, then re-run this script."
}

# --- Postgres -----------------------------------------------------------------
$Container = "devdigest-postgres"
$state = docker inspect -f '{{.State.Status}}' $Container 2>$null
if ($LASTEXITCODE -ne 0 -or -not $state) {
    Log "starting Postgres (docker compose up -d)"
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { Fail "docker compose up failed" }
} elseif ($state -ne "running") {
    Log "starting existing Postgres container"
    docker start $Container | Out-Null
} else {
    Log "Postgres container already running"
}

Log "waiting for Postgres to be healthy"
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
    $status = docker inspect -f '{{.State.Health.Status}}' $Container 2>$null
    if ($status -eq "healthy") { $healthy = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $healthy) { Fail "Postgres did not become healthy in time" }
Log "Postgres healthy"

# --- dev servers ----------------------------------------------------------------
Log "starting API on :3001 (server) in a new window"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\server'; pnpm dev"

Log "starting web on :3000 (client) in a new window"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\client'; pnpm dev"

# --- wait for the client to answer, then open the browser -----------------------
$ClientUrl = "http://localhost:3000"
Log "waiting for $ClientUrl to respond"
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        Invoke-WebRequest -Uri $ClientUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $ready) { Warn "client didn't respond in time - opening the browser anyway" }

Log "opening $ClientUrl in the default browser"
Start-Process $ClientUrl
