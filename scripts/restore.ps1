<#
.SYNOPSIS
  Restores the helpdesk database and uploaded files from a backup pair. No Docker required.

.DESCRIPTION
  The inverse of scripts\backup.ps1, in order:
    1. Stop whatever runs on :3001/:5173 so nothing reads the database mid-restore.
    2. Safety-dump the CURRENT database into backups\ first, so a restore that
       turns out to be the wrong dump can be undone. Non-fatal: a broken or
       empty database must not block the restore you came here to run.
    3. Verify the chosen dump with pg_restore --list (a corrupt dump is refused).
    4. pg_restore --clean --if-exists --no-owner  (drops and recreates objects).
    5. Unpack the matching uploads-<same stamp>.zip over server\uploads.

  Restores the newest backups\helpdesk-*.dump by default; pass -Dump to pick one.
  Credentials come from DATABASE_URL in server\.env (PGPASSWORD), like backup.ps1.

  The app is NOT restarted: start it with .\scripts\dev.ps1 (or npm run
  server:start) and verify with scripts\smoke-test.mjs. Existing sessions are
  invalidated - users simply sign in again.

  Docker stacks: use the volume procedure in README "Data and backups" instead.

.EXAMPLE
  .\scripts\restore.ps1
  .\scripts\restore.ps1 -Dump backups\helpdesk-20261019-153219.dump
#>
[CmdletBinding()]
param(
    # Dump to restore. Defaults to the newest backups\helpdesk-*.dump.
    [string]$Dump,
    [string]$DatabaseUrl
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root 'backups'
$uploadsDir = Join-Path $root 'server\uploads'
$pgBin = 'C:\Program Files\PostgreSQL\16\bin'

# -- Locate pg_restore/pg_dump (same fallback as backup.ps1)
if (-not (Test-Path (Join-Path $pgBin 'pg_restore.exe'))) {
    $pgBin = ''
    foreach ($exe in 'pg_restore', 'pg_dump') {
        if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
            Write-Host "ERROR: $exe not found. Install PostgreSQL or adjust `$pgBin in this script." -ForegroundColor Red
            exit 1
        }
    }
}
$pgRestore = if ($pgBin) { Join-Path $pgBin 'pg_restore.exe' } else { 'pg_restore' }
$pgDump = if ($pgBin) { Join-Path $pgBin 'pg_dump.exe' } else { 'pg_dump' }

# -- Resolve DATABASE_URL (server\.env first, then root .env)
if (-not $DatabaseUrl) {
    foreach ($file in (Join-Path $root 'server\.env'), (Join-Path $root '.env')) {
        if (-not (Test-Path $file)) { continue }
        $line = Get-Content $file | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
        if ($line) {
            $DatabaseUrl = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'").TrimEnd("`r")
            break
        }
    }
}
if (-not $DatabaseUrl) {
    Write-Host 'ERROR: DATABASE_URL not found in server\.env or .env. Pass -DatabaseUrl.' -ForegroundColor Red
    exit 1
}

# -- Parse the connection string for pg_restore/pg_dump
try {
    $uri = [System.Uri]$DatabaseUrl
    $dbUser = $uri.UserInfo.Split(':')[0]
    $dbPass = [System.Uri]::UnescapeDataString($uri.UserInfo.Substring($uri.UserInfo.IndexOf(':') + 1))
    $dbHost = $uri.Host
    $dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    $dbName = $uri.AbsolutePath.TrimStart('/')
} catch {
    Write-Host "ERROR: cannot parse DATABASE_URL: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
if ($dbName -match '\?') { $dbName = $dbName.Split('?')[0] }

# pg_restore/pg_dump read PGPASSWORD; never put the password on the command line.
$env:PGPASSWORD = $dbPass
$pgArgs = @('-h', $dbHost, '-p', "$dbPort", '-U', $dbUser, '-d', $dbName)

# -- Pick the dump: -Dump, else the newest backup
if (-not $Dump) {
    $newest = Get-ChildItem $backupDir -Filter 'helpdesk-*.dump' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if (-not $newest) {
        Write-Host "ERROR: no helpdesk-*.dump in $backupDir. Create one with .\scripts\backup.ps1." -ForegroundColor Red
        exit 1
    }
    $Dump = $newest.FullName
}
if (-not (Test-Path $Dump -PathType Leaf)) {
    Write-Host "ERROR: dump not found: $Dump" -ForegroundColor Red
    exit 1
}
$Dump = (Resolve-Path $Dump).Path

# The uploads archive shares the dump's stamp/tag: helpdesk-<x>.dump -> uploads-<x>.zip
$zipFile = Join-Path $backupDir ((Split-Path $Dump -Leaf) -replace '^helpdesk-', 'uploads-' -replace '\.dump$', '.zip')

Write-Host 'About to OVERWRITE the database and server\uploads with:' -ForegroundColor Yellow
Write-Host "  Database: $dbHost`:$dbPort/$dbName"
Write-Host "  Dump:     $Dump"
Write-Host "  Uploads:  $(if (Test-Path $zipFile) { $zipFile } else { '(none found for this dump)' })"
Write-Host ''

# -- 1. Stop the stack (same approach as update.ps1: tsx watch is the PARENT of
#  the API process and would respawn it, so kill whole project process trees).
$self = $PID
$ancestors = @()
$probe = Get-CimInstance Win32_Process -Filter "ProcessId = $self"
while ($probe) {
    $ancestors += [int]$probe.ProcessId
    $parentId = [int]$probe.ParentProcessId
    $probe = if ($parentId -gt 0) { Get-CimInstance Win32_Process -Filter "ProcessId = $parentId" } else { $null }
}
$escapedRoot = [WildcardPattern]::Escape($root)
$devProcs = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^(node|esbuild)\.exe$' -and
    $_.CommandLine -and
    $_.CommandLine -like "*$escapedRoot*" -and
    $_.CommandLine -match '(?i)(tsx|vite|npm-cli|esbuild)' -and
    ($ancestors -notcontains [int]$_.ProcessId)
})
foreach ($proc in $devProcs) {
    # A child may already be gone; suppress taskkill's 'not found' stderr.
    $ErrorActionPreference = 'Continue'
    & taskkill /PID $proc.ProcessId /T /F 2>$null | Out-Null
    $ErrorActionPreference = 'Stop'
}
if ($devProcs.Count -gt 0) { Write-Host "Stopped $($devProcs.Count) dev process tree(s)." -ForegroundColor Yellow }
foreach ($port in 3001, 5173) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        $opid = $_.OwningProcess
        $proc = Get-Process -Id $opid -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -match 'node') {
            & taskkill /PID $opid /T /F
        } elseif ($proc) {
            Write-Host "ERROR: port $port is occupied by '$($proc.ProcessName)' - stop it and re-run." -ForegroundColor Red
            exit 1
        }
    }
}
$free = $false
for ($i = 0; $i -lt 20; $i++) {
    $busy = @(Get-NetTCPConnection -LocalPort 3001, 5173 -State Listen -ErrorAction SilentlyContinue)
    if ($busy.Count -eq 0) { $free = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $free) { Write-Host 'ERROR: ports 3001/5173 are still in use.' -ForegroundColor Red; exit 1 }

# -- 2. Safety dump of the current database (non-fatal by design)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$safetyDump = Join-Path $backupDir "helpdesk-$stamp-prerestore.dump"
Write-Host "Safety-dumping current database -> $safetyDump" -ForegroundColor Cyan
& $pgDump -Fc -f $safetyDump @pgArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host 'WARNING: safety dump failed - restoring anyway (the database may be empty or broken).' -ForegroundColor Yellow
    if (Test-Path $safetyDump) { Remove-Item $safetyDump -Force }
    $safetyDump = $null
}

# -- 3. Verify the dump is readable before touching anything
Write-Host 'Verifying dump ...' -ForegroundColor Cyan
& $pgRestore --list $Dump | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: $Dump is not a readable pg_dump archive. Nothing was changed." -ForegroundColor Red
    exit 1
}

# -- 4. Restore the database
Write-Host "Restoring database '$dbName' ..." -ForegroundColor Cyan
& $pgRestore -h $dbHost -p "$dbPort" -U $dbUser -d $dbName --clean --if-exists --no-owner $Dump
$restoreExit = $LASTEXITCODE
if ($restoreExit -ne 0) {
    # pg_restore keeps going after a per-object error and exits non-zero, so the
    # damage is visible in the output above rather than silent.
    Write-Host ''
    Write-Host "RESTORE FINISHED WITH ERRORS (pg_restore exit $restoreExit) - read the output above." -ForegroundColor Red
    if ($safetyDump) { Write-Host "Safety dump of the previous state: $safetyDump" -ForegroundColor Yellow }
    exit 1
}

# -- 5. Uploaded files (attachments, ID photos/signatures)
$haveUploads = $false
if (Test-Path $zipFile) {
    Write-Host "Unpacking uploads -> $uploadsDir" -ForegroundColor Cyan
    Expand-Archive -Path $zipFile -DestinationPath $uploadsDir -Force
    $haveUploads = $true
} else {
    Write-Host "No $zipFile found - database restored, existing files left untouched." -ForegroundColor Yellow
}

# -- Summary
Write-Host ''
Write-Host 'Restore complete.' -ForegroundColor Green
Write-Host "  Database: $Dump"
if ($haveUploads) { Write-Host "  Uploads:  $zipFile" }
if ($safetyDump) { Write-Host "  Undo with: .\scripts\restore.ps1 -Dump '$safetyDump'" }
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Yellow
Write-Host '  .\scripts\dev.ps1                                  # start the app (or: npm run server:start)'
Write-Host '  node scripts/smoke-test.mjs http://localhost:3001 # verify (must be 0 failed)'
Write-Host '  Existing sessions are invalidated - sign in again.'
