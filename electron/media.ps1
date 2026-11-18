$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, [Type]$t) {
  $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op))
  if (-not $task.Wait(4000)) { return $null }
  $task.Result
}
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
$mgr = Await ($mgrType::RequestAsync()) $mgrType
if (-not $mgr) { Write-Output '{"error":"no-manager"}'; exit 1 }

$lastKey = ''
$lastState = ''
$art = $null
while ($true) {
  try {
    $s = $mgr.GetCurrentSession()
    if (-not $s) {
      if ($lastState -ne 'none') { Write-Output '{"session":null}'; $lastState = 'none'; $lastKey = '' }
    } else {
      $p = Await ($s.TryGetMediaPropertiesAsync()) $propsType
      $info = $s.GetPlaybackInfo()
      $tl = $s.GetTimelineProperties()
      $key = "$($s.SourceAppUserModelId)|$($p.Title)|$($p.Artist)|$($p.AlbumTitle)"
      if ($key -ne $lastKey) {
        $art = $null
        if ($p.Thumbnail) {
          $rs = Await ($p.Thumbnail.OpenReadAsync()) $streamType
          if ($rs) {
            $ns = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($rs)
            $ms = New-Object System.IO.MemoryStream
            $ns.CopyTo($ms)
            if ($ms.Length -gt 0 -and $ms.Length -lt 3000000) { $art = [Convert]::ToBase64String($ms.ToArray()) }
            $ns.Dispose(); $ms.Dispose()
          }
        }
      }
      $state = @{
        session = @{
          app = $s.SourceAppUserModelId
          title = $p.Title
          artist = $p.Artist
          album = $p.AlbumTitle
          status = [int]$info.PlaybackStatus
          canPrev = $info.Controls.IsPreviousEnabled
          canNext = $info.Controls.IsNextEnabled
          canToggle = $info.Controls.IsPlayPauseToggleEnabled
          position = $tl.Position.TotalSeconds
          duration = ($tl.EndTime - $tl.StartTime).TotalSeconds
          updated = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
        }
      }
      $sig = "$key|$($state.session.status)|$([math]::Round($state.session.position))|$([math]::Round($state.session.duration))"
      if ($key -ne $lastKey) { $state.session.art = $art; $state.session.artChanged = $true }
      if ($sig -ne $lastState) {
        Write-Output ($state | ConvertTo-Json -Compress -Depth 4)
        $lastState = $sig
      }
      $lastKey = $key
    }
  } catch { }
  Start-Sleep -Milliseconds 900
}
