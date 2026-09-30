param(
  [Parameter(Mandatory = $false)]
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
  [string]$Time = "20:30",

  [string]$TaskName = "Hydr CRM Daily Briefing Email"
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Runner = (Resolve-Path (Join-Path $PSScriptRoot "run-briefing-email.ps1")).Path

$Parts = $Time.Split(":")
$Hour = [int]$Parts[0]
$Minute = [int]$Parts[1]
$At = (Get-Date).Date.AddHours($Hour).AddMinutes($Minute)

$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`""

$Trigger = New-ScheduledTaskTrigger -Daily -At $At

$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description "Emails today's CRM Daily briefing ## Project updates section via Resend after ChatGPT writes it to the DB." `
  -Force | Out-Null

Write-Host "Installed '$TaskName' to run daily at $Time (local machine time)."
Write-Host "Repo: $RepoRoot"
Write-Host "Test now with: npm run briefings:email-daily"
Write-Host "Ensure the CRM server is running at CRM_BASE_URL and RESEND_API_KEY is set in .env.local."
