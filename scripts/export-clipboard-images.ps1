# Copies the images in Glide's clipboard history to a folder (default: Downloads\Glide Clipboard <date>).
# Read-only on the history: nothing is removed or changed.
#   powershell -ExecutionPolicy Bypass -File scripts\export-clipboard-images.ps1 [-List] [-Since '2026-10-18 01:26'] [-Dest <folder>] [-Log <file>]
# Run it from a regular terminal. Started from inside a packaged (MSIX / Store) app, %APPDATA%\Glide
# may resolve to that app's private copy instead of the real history (see install.ps1).
param([switch]$List, [string]$Since, [string]$Dest, [string]$Log)
$ErrorActionPreference = 'Stop'
function Say([string]$m) { Write-Host $m; if ($Log) { Add-Content -Path $Log -Value $m -Encoding UTF8 } }
try {
  $data = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Glide'
  $json = Get-Content (Join-Path $data 'clipboard.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $items = @($json.items)
  $images = @($items | Where-Object { $_.type -eq 'image' })
  Say ("history: {0} items, {1} images ({2})" -f $items.Count, $images.Count, (($items | Group-Object type | ForEach-Object { "$($_.Count) $($_.Name)" }) -join ', '))
  if ($Since) {
    $from = [DateTimeOffset]::new([datetime]::Parse($Since)).ToUnixTimeMilliseconds()
    $images = @($images | Where-Object { [int64]$_.at -ge $from })
    Say "copied since ${Since}: $($images.Count) images"
  }
  if ($List) {
    foreach ($it in $images | Select-Object -First 40) {
      $when = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$it.at).LocalDateTime
      Say ("  {0:yyyy-MM-dd HH:mm:ss}  {1}x{2}  {3}  {4}" -f $when, $it.w, $it.h, $(if ($it.source) { $it.source.name } else { '?' }), $(if (Test-Path $it.file) { 'ok' } else { 'MISSING' }))
    }
    return
  }
  if (-not $Dest) {
    $downloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
    $Dest = Join-Path $downloads ('Glide Clipboard ' + (Get-Date -Format 'yyyy-MM-dd HH-mm'))
  }
  New-Item -ItemType Directory -Force $Dest | Out-Null
  $n = 0; $missing = 0
  # oldest first, so file order matches the order you copied them in
  foreach ($it in ($images | Sort-Object { [int64]$_.at })) {
    $src = if ($it.file) { $it.file } else { Join-Path $data "clips\$($it.id).png" }
    if (-not (Test-Path $src)) { $missing++; continue }
    $when = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$it.at).LocalDateTime
    $base = 'Clipboard ' + $when.ToString('yyyy-MM-dd HH-mm-ss')
    $name = "$base.png"; $k = 2
    while (Test-Path (Join-Path $Dest $name)) { $name = "$base ($k).png"; $k++ }
    $out = Join-Path $Dest $name
    Copy-Item $src $out
    (Get-Item $out).LastWriteTime = $when
    $n++
  }
  Say "exported $n images to $Dest$(if ($missing) { " ($missing missing on disk)" })"
  Say 'Done.'
} catch { Say "ERROR: $_"; exit 1 }
