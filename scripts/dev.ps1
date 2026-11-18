# Send dev commands to a running unpackaged Glide (started with GLIDE_DEV=1) and print the result.
# Usage: .\scripts\dev.ps1 '[{"cmd":"open"},{"cmd":"wait","ms":800},{"cmd":"state"}]' [timeoutSec]
param([Parameter(Mandatory = $true)][string]$Json, [int]$TimeoutSec = 30)
$dir = Join-Path $env:APPDATA 'Glide'
$out = Join-Path $dir 'dev-out.json'
$id = [Guid]::NewGuid().ToString('N')
$req = '{"id":"' + $id + '","cmds":' + $Json + '}'
Set-Content -Path (Join-Path $dir 'dev-cmd.json') -Value $req -Encoding UTF8
$sw = [Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
  Start-Sleep -Milliseconds 100
  if (-not (Test-Path $out)) { continue }
  try { $raw = Get-Content $out -Raw -ErrorAction Stop } catch { continue }
  if ($raw -and $raw.Contains($id)) {
    $obj = $raw | ConvertFrom-Json
    ConvertTo-Json -InputObject @($obj.results) -Depth 12
    return
  }
}
'timeout'
