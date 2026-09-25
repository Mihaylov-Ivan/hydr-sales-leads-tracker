$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source
Set-Location -LiteralPath $RepoRoot
& $Npm run summaries:refresh
exit $LASTEXITCODE
