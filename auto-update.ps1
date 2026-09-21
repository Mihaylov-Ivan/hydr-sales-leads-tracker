$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\repos\hydr-sales-leads-tracker\auto-update.ps1"'

$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 30)

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "Hydr Sales Tracker Auto Update" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Checks origin/main every 30 minutes and rebuilds/restarts the Hydr sales tracker when updated." `
    -Force
    