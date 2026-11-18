# Removes Glide for the current user. Add -KeepData to keep settings, clipboard history and notes.
param([switch]$KeepData)
Get-Process Glide -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800
Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Glide' -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Glide.lnk') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:LOCALAPPDATA 'Programs\Glide') -Recurse -Force -ErrorAction SilentlyContinue
if (-not $KeepData) { Remove-Item (Join-Path $env:APPDATA 'Glide') -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host 'Glide removed.'
