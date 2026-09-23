# Run from an Administrator PowerShell window on the server PC.
$ErrorActionPreference = "Stop"
$subnet = "192.168.1.0/24"

$appRule = Get-NetFirewallRule -Name "SiniloanEDM-LAN-3001" -ErrorAction SilentlyContinue
if ($appRule) { Remove-NetFirewallRule -Name "SiniloanEDM-LAN-3001" }
New-NetFirewallRule -Name "SiniloanEDM-LAN-3001" -DisplayName "Siniloan EDM LAN" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001 `
  -RemoteAddress $subnet -Profile Any | Out-Null

$supabaseRule = Get-NetFirewallRule -Name "SiniloanEDM-Block-Supabase-LAN" -ErrorAction SilentlyContinue
if ($supabaseRule) { Remove-NetFirewallRule -Name "SiniloanEDM-Block-Supabase-LAN" }
New-NetFirewallRule -Name "SiniloanEDM-Block-Supabase-LAN" -DisplayName "Block local Supabase from LAN" `
  -Direction Inbound -Action Block -Protocol TCP -LocalPort 54320-54324 `
  -RemoteAddress $subnet -Profile Any | Out-Null

Write-Output "Allowed app port 3001 and blocked Supabase ports 54320-54324 for $subnet."
