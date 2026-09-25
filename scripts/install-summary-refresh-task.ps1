param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^([01]\\d|2[0-3]):[0-5]\\d$')]
  [string]$Time,

  [string]$TaskName = "Hydr CRM Daily Project Summaries"
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source

$Parts = $Time.Split(":")
$Hour = [int]$Parts[0]
$Minute = [int]$Parts[1]
$At = (Get-Date).Date.AddHours($Hour).AddMinutes($Minute)

$QuotedRepo = '"' + $RepoRoot.Replace('"', '""') + '"'
$Command = "cd /d $QuotedRepo && `"$Npm`" run summaries:refresh"

$Action = New-ScheduledTaskAction `
  -Execute "$env:ComSpec" `
  -Argument "/d /s /c `"$Command`""

$Trigger = New-ScheduledTaskTrigger -Daily -At $At

$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description "Regenerates all Hydr CRM project summaries from CRM data only." `
  -Force | Out-Null

Write-Host "Installed '$TaskName' to run daily at $Time."
Write-Host "Repo: $RepoRoot"
Write-Host "Test now with: npm run summaries:refresh"
