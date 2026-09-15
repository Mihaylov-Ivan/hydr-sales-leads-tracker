# ============================================================
# Supabase Postgres backup (schema + data)
#
# Prerequisites:
#   1. PostgreSQL client tools installed so `pg_dump` is on PATH
#      (https://www.postgresql.org/download/windows/)
#   2. SUPABASE_DB_URL set to the Postgres connection URI from:
#      Supabase Dashboard → Project Settings → Database → Connection string → URI
#      Example:
#        postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:5432/postgres
#      If the password contains special characters (@, #, %, etc.), URL-encode them.
#
# Usage (from repo root):
#   $env:SUPABASE_DB_URL = "postgresql://..."
#   .\scripts\backup-supabase.ps1
#
# Output: backups\supabase-YYYYMMDD-HHmmss.sql
# ============================================================

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backupsDir = Join-Path $repoRoot "backups"

if (-not $env:SUPABASE_DB_URL -or -not $env:SUPABASE_DB_URL.Trim()) {
    Write-Error @"
SUPABASE_DB_URL is not set.

Get the URI from: Supabase Dashboard → Project Settings → Database → Connection string → URI
Then run:
  `$env:SUPABASE_DB_URL = "postgresql://postgres....:PASSWORD@.../postgres"
  .\scripts\backup-supabase.ps1
"@
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
    Write-Error @"
pg_dump was not found on PATH.

Install PostgreSQL client tools (https://www.postgresql.org/download/windows/)
and ensure the bin folder is on your PATH, then re-run this script.
"@
}

if (-not (Test-Path $backupsDir)) {
    New-Item -ItemType Directory -Path $backupsDir | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $backupsDir "supabase-$stamp.sql"

Write-Host "Backing up Supabase database..."
Write-Host "  Output: $outFile"

& pg_dump `
    --dbname="$($env:SUPABASE_DB_URL.Trim())" `
    --format=plain `
    --no-owner `
    --no-acl `
    --file="$outFile"

if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump failed with exit code $LASTEXITCODE"
}

$size = (Get-Item $outFile).Length
Write-Host ("Backup complete ({0:N0} bytes)." -f $size)
Write-Host $outFile
