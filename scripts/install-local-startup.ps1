$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$startupScript = Join-Path $PSScriptRoot "start-local-server.ps1"
$powershellExe = Join-Path $PSHOME "powershell.exe"
$userName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskName = "Siniloan Enterprise Data Management"

$action = New-ScheduledTaskAction -Execute $powershellExe `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startupScript`"" `
  -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
$principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Description "Starts Docker Desktop, local Supabase, and the Siniloan web app after sign-in." -Force | Out-Null
Write-Output "Installed startup task: $taskName for $userName"
