<#
.SYNOPSIS
    DevDigest local bootstrap — bring the whole stack up from zero (Windows/PowerShell port of dev.sh).

.DESCRIPTION
    .\scripts\dev.ps1              # full: docker -> migrate -> seed -> server + client
    .\scripts\dev.ps1 -NoSeed      # skip the demo seed
    .\scripts\dev.ps1 -NoClient    # run only Postgres + API (no Next.js)
    .\scripts\dev.ps1 -DbOnly      # just Postgres + migrate + seed, then exit

    Idempotent: re-running installs only what's missing, migrations and seed
    both upsert. Ctrl-C stops the dev servers and leaves Postgres running.
#>

param(
    [switch]$NoSeed,
    [switch]$NoClient,
    [switch]$DbOnly,
    [switch]$Help
)

if ($Help) {
    Get-Help $PSCommandPath -Full
    exit 0
}

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Container = "devdigest-postgres"
$RunSeed = -not $NoSeed
$RunClient = -not $NoClient

function Write-Log($Message) { Write-Host "$([char]0x25B8) $Message" -ForegroundColor Cyan }
function Write-Warn($Message) { Write-Host "! $Message" -ForegroundColor Yellow }

function Invoke-Checked {
    param([Parameter(Mandatory)][ScriptBlock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# --- prerequisites -----------------------------------------------------------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Error "docker not found"; exit 1 }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Write-Error "pnpm not found (npm i -g pnpm)"; exit 1 }

# --- env files ---------------------------------------------------------------
foreach ($dir in @("server", "client")) {
    $envPath = Join-Path $Root "$dir\.env"
    $examplePath = Join-Path $Root "$dir\.env.example"
    if (-not (Test-Path $envPath) -and (Test-Path $examplePath)) {
        Copy-Item $examplePath $envPath
        Write-Warn "created $dir/.env from .env.example - add your API keys (OPENAI/ANTHROPIC/GITHUB_TOKEN) in server/.env"
    }
}

# --- Postgres ------------------------------------------------------------------
# The container name is fixed (container_name: devdigest-postgres), so if one is
# already running (possibly under another compose project) we reuse it instead
# of failing on a name conflict. If it exists but is stopped, start it; else
# create it via compose.
$state = docker inspect -f '{{.State.Status}}' $Container 2>$null
if (-not $state) { $state = "missing" }

switch ($state) {
    "running" { Write-Log "Postgres container already running - reusing it" }
    { $_ -in @("exited", "created") } {
        Write-Log "starting existing Postgres container"
        docker start $Container | Out-Null
    }
    default {
        Write-Log "starting Postgres (docker compose up -d)"
        docker compose up -d
    }
}

Write-Log "waiting for Postgres to be healthy"
$status = "starting"
for ($i = 0; $i -lt 60; $i++) {
    $status = docker inspect -f '{{.State.Health.Status}}' $Container 2>$null
    if (-not $status) { $status = "starting" }
    if ($status -eq "healthy") { break }
    Start-Sleep -Seconds 1
}
if ($status -ne "healthy") {
    Write-Error "Postgres did not become healthy in time"
    exit 1
}
Write-Log "Postgres healthy"

# --- install deps (only if missing) ------------------------------------------
function Install-IfNeeded {
    param([Parameter(Mandatory)][string]$Dir)
    if (-not (Test-Path (Join-Path $Dir "node_modules"))) {
        Write-Log "installing deps in $Dir"
        Push-Location $Dir
        try { Invoke-Checked { pnpm install } }
        finally { Pop-Location }
    }
}
Install-IfNeeded -Dir (Join-Path $Root "server")
if (-not $DbOnly -and $RunClient) { Install-IfNeeded -Dir (Join-Path $Root "client") }

# reviewer-core's RAW source is imported by the API at runtime (tsconfig alias);
# without its deps the API crashes at boot with ERR_MODULE_NOT_FOUND. It uses npm.
$reviewerCore = Join-Path $Root "reviewer-core"
if (-not (Test-Path (Join-Path $reviewerCore "node_modules"))) {
    Write-Log "installing deps in reviewer-core"
    Push-Location $reviewerCore
    try { Invoke-Checked { npm ci } }
    finally { Pop-Location }
}

# --- migrate + seed ------------------------------------------------------------
Write-Log "applying migrations"
Push-Location (Join-Path $Root "server")
try { Invoke-Checked { pnpm db:migrate } }
finally { Pop-Location }

if ($RunSeed) {
    Write-Log "seeding demo data"
    Push-Location (Join-Path $Root "server")
    try { Invoke-Checked { pnpm db:seed } }
    finally { Pop-Location }
}

if ($DbOnly) {
    Write-Log "DB ready. Postgres is running; server/client not started (-DbOnly)."
    exit 0
}

# --- dev servers -----------------------------------------------------------
# pnpm on Windows resolves to a .CMD shim, which Start-Process can't launch
# directly as a Win32 executable — route it through cmd.exe.
$serverProcess = $null

try {
    Write-Log "starting API on :3001 (server)"
    $serverProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm", "dev" `
        -WorkingDirectory (Join-Path $Root "server") -PassThru -NoNewWindow

    if ($RunClient) {
        Write-Log "starting web on :3000 (client) - Ctrl-C to stop both"
        Push-Location (Join-Path $Root "client")
        try { & pnpm dev }
        finally { Pop-Location }
    }
    else {
        Write-Log "API running (PID $($serverProcess.Id)) - Ctrl-C to stop"
        Wait-Process -Id $serverProcess.Id
    }
}
finally {
    Write-Log "shutting down dev servers (Postgres stays up; stop it with: docker compose down)"
    if ($serverProcess -and -not $serverProcess.HasExited) {
        # cmd.exe /c spawns pnpm.cmd -> node as children; kill the whole tree,
        # not just the cmd.exe wrapper, or the node process on :3001 leaks.
        taskkill /PID $serverProcess.Id /T /F 2>$null | Out-Null
    }
}
