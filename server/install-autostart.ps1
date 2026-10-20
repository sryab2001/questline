# Optional: start the Questline server automatically when you log in to Windows.
# Creates a scheduled task named "Questline Server" for the current user.
# Remove it later with:  Unregister-ScheduledTask -TaskName 'Questline Server'
$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'start.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName 'Questline Server' -Action $action -Trigger $trigger -Settings $settings `
    -Description 'PocketBase sync server for the Questline app' -Force | Out-Null
Write-Host "Scheduled task 'Questline Server' created. It starts at your next log-in."
