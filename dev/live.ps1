param(
  [string]$Url = '',
  [string]$Probe = '',
  [string]$Out = '',
  [int]$Wait = 6000
)
$ErrorActionPreference = 'Stop'
$port = 9333
$ud = Join-Path $env:TEMP 'edge-gp-live'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

$ver = $null
try { $ver = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" -TimeoutSec 2 } catch { $ver = $null }

if (-not $ver) {
  $args = @(
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-sync', '--disable-background-networking', '--mute-audio', '--no-sandbox',
    "--user-data-dir=$ud",
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--hide-scrollbars', '--window-size=1600,900',
    "--remote-debugging-port=$port",
    'about:blank'
  )
  Start-Process -FilePath $edge -ArgumentList $args | Out-Null
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 400
    try { $ver = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" -TimeoutSec 2; break } catch { }
  }
  if (-not $ver) { throw '浏览器没能起来' }
  "started: $($ver.Browser)  (profile $ud)"
} else {
  "reuse:   $($ver.Browser)"
}

if ($Url -and $Probe) {
  $env:CDP_PORT = "$port"
  if ($Out) { node 'D:\developing\webdesign\grid-pillars\dev\probe.js' $Url $Probe $Out $Wait } else { node 'D:\developing\webdesign\grid-pillars\dev\probe.js' $Url $Probe '' $Wait }
}
