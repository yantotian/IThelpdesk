<#
.SYNOPSIS
  Backs up the helpdesk database and uploaded files. No Docker required.

.DESCRIPTION
  Creates a timestamped pair in the backups\ folder next to the project root:
    backups\helpdesk-YYYYMMDD-HHMMSS.dump   (pg_dump custom format, compressed)
    backups\uploads-YYYYMMDD-HHMMSS.zip     (server/uploads: attachments, photos)

  The dump is verified with pg_restore --list before the script reports success,
  so a corrupt backup can never be mistaken for a good one. The oldest backup
  pairs beyond -Keep are pruned automatically (default 7).

  Credentials come from DATABASE_URL in server\.env (PGPASSWORD), so the script
  runs unattended. Override with -DatabaseUrl if your connection string lives
  elsewhere.

.EXAMPLE
  .\scripts\backup.ps1
  .\scripts\backup.ps1 -Keep 14
#>
[CmdletBinding()]
param(
    [string]$DatabaseUrl,
    [int]$Keep = 7,
    [string]$Tag = ''
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root 'backups'
$pgBin = 'C:\Program Files\PostgreSQL\16\bin'

# -- Locate pg_dump
if (-not (Test-Path (Join-Path $pgBin 'pg_dump.exe'))) {
    # Fall back to PATH so a different PostgreSQL version still works.
    $pgBin = ''
    foreach ($exe in 'pg_dump', 'pg_restore') {
        if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
            Write-Host "ERROR: $exe not found. Install PostgreSQL or adjust `$pgBin in this script." -ForegroundColor Red
            exit 1
        }
    }
}
$pgDump = if ($pgBin) { Join-Path $pgBin 'pg_dump.exe' } else { 'pg_dump' }
$pgRestore = if ($pgBin) { Join-Path $pgBin 'pg_restore.exe' } else { 'pg_restore' }

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

# -- Parse the connection string for pg_dump/pg_restore
# postgres://user:pass@host:port/dbname  (password may be URL-encoded)
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

# pg_dump/pg_restore read PGPASSWORD; never put the password on the command line.
$env:PGPASSWORD = $dbPass
$pgArgs = @('-h', $dbHost, '-p', "$dbPort", '-U', $dbUser, '-d', $dbName)

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$suffix = if ($Tag) { "-$Tag" } else { '' }
$dumpFile = Join-Path $backupDir "helpdesk-$stamp$suffix.dump"
$zipFile = Join-Path $backupDir "uploads-$stamp$suffix.zip"

# -- 1. Database dump
Write-Host "Dumping database '$dbName' -> $dumpFile" -ForegroundColor Cyan
& $pgDump -Fc -f $dumpFile @pgArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: pg_dump failed (exit $LASTEXITCODE)." -ForegroundColor Red
    if (Test-Path $dumpFile) { Remove-Item $dumpFile -Force }
    exit 1
}

# -- 2. Verify the dump is readable (catches truncated/corrupt backups)
Write-Host 'Verifying dump ...' -ForegroundColor Cyan
& $pgRestore --list $dumpFile | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: dump failed verification (pg_restore --list). Backup NOT kept.' -ForegroundColor Red
    Remove-Item $dumpFile -Force -ErrorAction SilentlyContinue
    exit 1
}

# -- 3. Uploaded files (attachments, ID photos/signatures)
$uploadsDir = Join-Path $root 'server\uploads'
$haveUploads = $false
if (Test-Path $uploadsDir) {
    Write-Host "Archiving uploads -> $zipFile" -ForegroundColor Cyan
    Compress-Archive -Path (Join-Path $uploadsDir '*') -DestinationPath $zipFile -Force
    $haveUploads = $true
} else {
    Write-Host 'No server\uploads folder found - skipping file archive.' -ForegroundColor Yellow
}

# -- 4. Prune old pairs, keep the $Keep newest
$oldDumps = Get-ChildItem $backupDir -Filter 'helpdesk-*.dump' |
    Sort-Object Name -Descending |
    Select-Object -Skip $Keep
foreach ($old in $oldDumps) {
    $stampInName = $old.BaseName -replace '^helpdesk-', ''
    Get-ChildItem $backupDir -Filter "uploads-$stampInName*.zip" -ErrorAction SilentlyContinue |
        Remove-Item -Force
    Remove-Item $old.FullName -Force
    Write-Host "Pruned old backup: $($old.Name)" -ForegroundColor DarkGray
}

# -- 5. Summary
$dumpSize = '{0:N1} MB' -f ((Get-Item $dumpFile).Length / 1MB)
Write-Host ''
Write-Host 'Backup complete.' -ForegroundColor Green
Write-Host "  Database: $dumpFile ($dumpSize)"
if ($haveUploads) {
    $zipSize = '{0:N1} MB' -f ((Get-Item $zipFile).Length / 1MB)
    Write-Host "  Uploads:  $zipFile ($zipSize)"
}
$total = (Get-ChildItem $backupDir -Filter 'helpdesk-*.dump' -ErrorAction SilentlyContinue).Count
Write-Host "  $total backup pair(s) in backups\ (keeping $Keep)"
Write-Host ''
Write-Host 'Restore with: see README "Restoring from a backup".' -ForegroundColor Yellow
