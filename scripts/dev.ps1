<#
.SYNOPSIS
  Runs the API and the Vite dev server together, without Docker.

.DESCRIPTION
  Starts, in one terminal:
    - the Express API    -> http://localhost:3001   (tsx watch, hot-reload)
    - the Vite dev server -> http://localhost:5173  (proxies /api to 3001)

  Requires PostgreSQL running locally (see server/.env for DATABASE_URL).
  Ctrl+C (or closing the window) stops both processes and their children.

.EXAMPLE
  .\scripts\dev.ps1
#>
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

# Fail fast with a clear message if the API config is missing.
if (-not (Test-Path (Join-Path $root 'server\.env'))) {
    Write-Host "server\.env not found. Copy server\.env.example to server\.env and set DATABASE_URL." -ForegroundColor Red
    exit 1
}

# npm ships as npm.cmd on Windows; 'npm' alone resolves to the Unix shell stub,
# which Start-Process cannot execute.
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$procs = @()

function Stop-Tree([System.Diagnostics.Process]$p) {
    if ($p -and -not $p.HasExited) {
        # /T also stops the children (node running tsx/vite), which survive a
        # plain kill of the npm wrapper.
        & taskkill /PID $p.Id /T /F 2>$null | Out-Null
    }
}

try {
    Write-Host "Starting API on http://localhost:3001 ..." -ForegroundColor Cyan
    $procs += Start-Process -FilePath $npm -ArgumentList '--prefix', 'server', 'run', 'dev' `
        -WorkingDirectory $root -NoNewWindow -PassThru

    Write-Host "Starting Vite on http://localhost:5173 ..." -ForegroundColor Cyan
    $procs += Start-Process -FilePath $npm -ArgumentList 'run', 'dev' `
        -WorkingDirectory $root -NoNewWindow -PassThru

    Write-Host ""
    Write-Host "App:     http://localhost:5173" -ForegroundColor Green
    Write-Host "API:     http://localhost:3001" -ForegroundColor Green
    Write-Host "Health:  http://localhost:3001/api/health" -ForegroundColor Green
    Write-Host ""
    Write-Host "Press Ctrl+C to stop both." -ForegroundColor Yellow

    # Wait until either process exits (then tear the other one down too).
    while ($true) {
        $running = @($procs | Where-Object { -not $_.HasExited })
        if ($running.Count -eq 0) { break }
        Start-Sleep -Seconds 1
    }
}
finally {
    foreach ($p in $procs) { Stop-Tree $p }
}
