# Builds (unless -NoBuild), installs Glide for the current user and starts it.
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
param([switch]$NoBuild, [switch]$Here, [string]$Log)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $NoBuild) {
  node (Join-Path $root 'scripts\package.js')
  if ($LASTEXITCODE -ne 0) { throw 'packaging failed' }
}

# When this script is started from inside a packaged (MSIX / Store) app, such as a terminal or
# editor installed from the Store, Windows can redirect its registry writes and new AppData
# folders into that app's private copy, which is never read at login: the Run entry vanishes and
# Glide keeps its data where nothing else sees it. So the install steps always run in a fresh
# process started through WMI, which sits outside any app's private copy. -Here skips that.
if (-not $Here) {
  $out = Join-Path $root 'out\install.log'
  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  Remove-Item $out -ErrorAction SilentlyContinue
  $cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -NoBuild -Here -Log `"$out`""
  $si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $cmd; CurrentDirectory = $root; ProcessStartupInformation = $si
  }
  if ($r.ReturnValue -ne 0) { throw "could not start the install step via WMI (code $($r.ReturnValue))" }
  while (Get-Process -Id $r.ProcessId -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 300 }
  $lines = if (Test-Path $out) { Get-Content $out } else { @() }
  $lines | ForEach-Object { Write-Host $_ }
  if (-not ($lines -match '^Done\.')) { throw "install step failed, see $out" }
  exit 0
}

function Say([string]$m) { Write-Host $m; if ($Log) { Add-Content -Path $Log -Value $m } }
try {
# known folders, not env vars: they are right however this process was started
$local = [Environment]::GetFolderPath('LocalApplicationData')
$roaming = [Environment]::GetFolderPath('ApplicationData')
$src = Join-Path $root 'out\Glide-win32-x64'
$dest = Join-Path $local 'Programs\Glide'
if (-not (Test-Path (Join-Path $src 'Glide.exe'))) { throw "No build found in $src" }

Say '> stopping running Glide'
Get-Process Glide -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800

Say "> copying to $dest"
New-Item -ItemType Directory -Force $dest | Out-Null
robocopy $src $dest /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "copy failed ($LASTEXITCODE)" }

Say '> Start menu shortcut'
$lnk = Join-Path $roaming 'Microsoft\Windows\Start Menu\Programs\Glide.lnk'
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($lnk)
$s.TargetPath = Join-Path $dest 'Glide.exe'
$s.WorkingDirectory = $dest
$s.IconLocation = (Join-Path $dest 'Glide.exe') + ',0'
$s.Description = 'Glide - a fluid glass sidebar'
$s.Save()

Say '> launch at login'
$exe = Join-Path $dest 'Glide.exe'
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Glide' -Value "`"$exe`" --startup"
# clear a stale "disabled" flag from Task Manager's Startup apps, if any
$approved = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
if (Test-Path $approved) { Remove-ItemProperty $approved -Name 'Glide' -ErrorAction SilentlyContinue }

Say '> starting Glide'
Start-Process $exe -WorkingDirectory $dest
Say 'Done. Click the pill on the right edge of your screen, or press Win+Shift+X.'
} catch { Say "ERROR: $_"; exit 1 }
