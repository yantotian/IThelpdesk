<#
.SYNOPSIS
  Updates the helpdesk application without risking the user database.

.DESCRIPTION
  Safe-update pipeline, in order:
    1. Refuse to run with a dirty working tree (commit first).
    2. git fetch and show the incoming commits.
    3. SCHEMA GATE: diff server/src/db/schema.sql against the incoming commit.
       Aborts if new lines introduce destructive DDL (DROP TABLE, TRUNCATE,
       DELETE FROM, DROP COLUMN, DROP SCHEMA, DROP DATABASE)  review manually,
       then re-run with -SkipSchemaGate to accept.
    4. Fresh backup (scripts/backup.ps1)  always before anything changes.
    5. Stop whatever runs on :3001/:5173 so installs/builds can replace files.
    6. git pull --ff-only.
    7. npm ci (root + server), then build frontend and API.
    8. Start the stack (dev by default; -Prod for the single-process build).
    9. Wait for /api/health, then run the smoke test (must be 0 failed).

  On failure the script prints the backup path and the restore steps; it never
  restores automatically, because that would discard any post-update data 
  that decision stays with you.

.EXAMPLE
  .\scripts\update.ps1
  .\scripts\update.ps1 -Prod
  .\scripts\update.ps1 -SkipSchemaGate
#>
[CmdletBinding()]
param(
    # Run the built single-process app (Express serves the SPA) instead of the
    # dev stack (Vite + tsx watch).
    [switch]$Prod,
    # Accept the schema gate after manual review.
    [switch]$SkipSchemaGate
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

function Fail([string]$msg, [string]$hint = '') {
    Write-Host ''
    Write-Host "UPDATE STOPPED: $msg" -ForegroundColor Red
    if ($hint) { Write-Host $hint -ForegroundColor Yellow }
    Write-Host ''
    exit 1
}

function Invoke-Native([string]$file, [string[]]$args, [string]$what) {
    & $file @args
    if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit $LASTEXITCODE)." }
}

try {
    #  1. Clean working tree 
    $dirty = & git status --porcelain
    if ($dirty) {
        Write-Host 'Uncommitted changes found:' -ForegroundColor Yellow
        $dirty | ForEach-Object { Write-Host "  $_" }
        Fail 'Commit (or stash) your changes before updating.' `
            'Your local work is preserved  this prevents git pull from conflicting with it.'
    }
    $headBefore = (& git rev-parse --short HEAD).Trim()

    #  2. Fetch and show what is coming 
    Write-Host 'Fetching origin ...' -ForegroundColor Cyan
    Invoke-Native 'git' @('fetch', 'origin', 'new-main') 'git fetch'

    $incoming = & git rev-list --count "HEAD..origin/new-main"
    if ($LASTEXITCODE -ne 0) { Fail 'git rev-list failed  is origin/new-main reachable?' }
    if ("$incoming" -eq '0') {
        Write-Host 'Already up to date with origin/new-main. Re-verifying the current build.' -ForegroundColor Green
    } else {
        Write-Host "Incoming commits: $incoming" -ForegroundColor Cyan
        & git log --oneline "HEAD..origin/new-main"
        Write-Host ''
        & git diff --stat "HEAD..origin/new-main"
    }

    #  3. Schema gate 
    # Only ADDED lines are inspected: schema.sql is re-applied on every boot,
    # so a destructive statement added there would execute against live data.
    # DROP TRIGGER/CONSTRAINT IF EXISTS are safe (re-created) and do not match.
    $destructive = '(?i)\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bDROP\s+COLUMN\b|\bDROP\s+SCHEMA\b|\bDROP\s+DATABASE\b'
    $diff = & git diff "HEAD..origin/new-main" -- 'server/src/db/schema.sql'
    $bad = @($diff | Where-Object { $_ -match '^\+' -and $_ -notmatch '^\+\+\+' -and $_ -match $destructive })
    if ($bad.Count -gt 0 -and -not $SkipSchemaGate) {
        Write-Host ''
        Write-Host 'SCHEMA GATE: incoming schema.sql contains DESTRUCTIVE statements:' -ForegroundColor Red
        $bad | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Fail 'Not updating the database until this is reviewed.' @'
  The new schema.sql runs on next boot. Read the diff:
      git diff HEAD..origin/new-main -- server/src/db/schema.sql
  If it is safe (e.g. deliberate data migration), re-run with -SkipSchemaGate.
  Your latest backup is still in backups\ either way.
'@
    }
    if ($bad.Count -gt 0) {
        Write-Host "Schema gate overridden (-SkipSchemaGate): $($bad.Count) destructive line(s) accepted." -ForegroundColor Yellow
    }

    #  4. Backup before changing anything 
    Write-Host ''
    Write-Host '=== Backing up before update ===' -ForegroundColor Cyan
    Invoke-Native 'powershell' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'backup.ps1')) 'backup.ps1'
    $latestDump = (Get-ChildItem (Join-Path $root 'backups') -Filter 'helpdesk-*.dump' | Sort-Object Name -Descending | Select-Object -First 1).FullName

    #  5. Stop the running stack (before npm ci wipes node_modules) 
    $stopped = @()
    foreach ($port in 3001, 5173) {
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
            $opid = $_.OwningProcess
            $proc = Get-Process -Id $opid -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -match 'node|powershell|cmd') {
                & taskkill /PID $opid /T /F
                $stopped += "$($proc.ProcessName) ($opid) on :$port"
            } else {
                Fail "Port $port is occupied by '$($proc.ProcessName)'  stop it manually and re-run."
            }
        }
    }
    if ($stopped.Count -gt 0) {
        Write-Host "Stopped: $($stopped -join ', ')" -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }

    #  6. Pull 
    Write-Host ''
    Write-Host '=== Pulling ===' -ForegroundColor Cyan
    Invoke-Native 'git' @('pull', '--ff-only', 'origin', 'new-main') 'git pull'

    #  7. Dependencies + builds 
    Write-Host ''
    Write-Host '=== Installing dependencies ===' -ForegroundColor Cyan
    Invoke-Native 'npm.cmd' @('ci', '--no-audit', '--no-fund') 'npm ci (root)'
    Invoke-Native 'npm.cmd' @('--prefix', 'server', 'ci', '--no-audit', '--no-fund') 'npm ci (server)'

    Write-Host ''
    Write-Host '=== Building ===' -ForegroundColor Cyan
    Invoke-Native 'npm.cmd' @('run', 'build') 'frontend build'
    Invoke-Native 'npm.cmd' @('run', 'server:build') 'API build'

    #  8. Start the stack 
    $mode = if ($Prod) { 'production' } else { 'dev' }
    Write-Host ''
    Write-Host "=== Starting ($mode mode) ===" -ForegroundColor Cyan
    if ($Prod) {
        $prodCmd = "& { `$env:NODE_ENV = 'production'; Set-Location -LiteralPath '" + $root + "'; npm run server:start }"
        Start-Process powershell -ArgumentList '-NoProfile', '-Command', $prodCmd -WorkingDirectory $root
    } else {
        Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'dev.ps1') -WorkingDirectory $root
    }

    #  9. Health + smoke test 
    $health = $false
    for ($i = 0; $i -lt 40; $i++) {
        try {
            $r = Invoke-WebRequest -Uri 'http://localhost:3001/api/health' -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { $health = $true; break }
        } catch { Start-Sleep -Seconds 1.5 }
    }
    if (-not $health) {
        Fail 'API did not come up within 60s after the update.' @"
  Latest backup: $latestDump
  Restore steps: README 'Restoring from a backup'.
  Or start manually for diagnostics: .\scripts\dev.ps1
"@
    }
    Write-Host 'API healthy.' -ForegroundColor Green

    Write-Host ''
    Write-Host '=== Smoke test ===' -ForegroundColor Cyan
    $smokeOut = & node scripts/smoke-test.mjs 'http://localhost:3001'
    $smokeExit = $LASTEXITCODE
    $summary = ($smokeOut | Out-String) -match '(\d+)\s+passed,\s+(\d+)\s+failed'
    $failedCount = if ($summary) { [int]$Matches[2] } else { -1 }

    #  10. Report 
    Write-Host ''
    if ($smokeExit -eq 0 -and $failedCount -eq 0) {
        $headAfter = (& git rev-parse --short HEAD).Trim()
        Write-Host ('=' * 64) -ForegroundColor Green
        Write-Host "UPDATE OK: $headBefore -> $headAfter  |  smoke test passed (0 failed)" -ForegroundColor Green
        if ($Prod) {
            Write-Host 'Running: http://localhost:3001' -ForegroundColor Green
        } else {
            Write-Host 'Running: http://localhost:5173 (API :3001)' -ForegroundColor Green
        }
        Write-Host "Backup:  $latestDump"
        Write-Host ('=' * 64) -ForegroundColor Green
        Write-Host ''
        Write-Host 'Stop the stack with:' -ForegroundColor Yellow
        Write-Host '  Get-NetTCPConnection -LocalPort 3001,5173 -State Listen | ForEach-Object { taskkill /PID $_.OwningProcess /T /F }'
    } else {
        Write-Host ('=' * 64) -ForegroundColor Red
        Write-Host 'UPDATE FINISHED BUT SMOKE TEST FAILED  data itself was not modified by the test.' -ForegroundColor Red
        Write-Host "Latest backup: $latestDump" -ForegroundColor Yellow
        Write-Host 'Restore steps: README "Restoring from a backup".' -ForegroundColor Yellow
        Write-Host 'Diagnose first: check the app window output; re-run scripts\smoke-test.mjs.' -ForegroundColor Yellow
        Write-Host ('=' * 64) -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}
