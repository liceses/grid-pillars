param(
  [string]$Url   = 'file:///D:/developing/webdesign/grid-pillars/index.html',
  [string]$Out   = 'D:\developing\webdesign\grid-pillars\.dsh\shot.png',
  [int]$WaitSec  = 60,
  [int]$Budget   = 6000,
  [int]$W        = 1600,
  [int]$H        = 900
)
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edge)) { throw "edge not found" }

if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Force }

$ud = Join-Path $env:TEMP ('edge-shot-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$eo = @(
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-sync', '--disable-background-networking', '--mute-audio',
  "--user-data-dir=$ud",
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  "--window-size=$W,$H",
  "--virtual-time-budget=$Budget",
  "--screenshot=$Out",
  $Url
)
Start-Process -FilePath $edge -ArgumentList $eo | Out-Null

$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $WaitSec) {
  if (Test-Path -LiteralPath $Out) { break }
  Start-Sleep -Milliseconds 400
}
# 让浏览器把 PNG 写完整
Start-Sleep -Milliseconds 600

if (Test-Path -LiteralPath $Out) {
  $len = (Get-Item -LiteralPath $Out).Length
  "OK $len bytes in $([int]$sw.Elapsed.TotalSeconds)s -> $Out"
} else {
  "FAIL: screenshot not produced within ${WaitSec}s"
  Get-Process msedge -ErrorAction SilentlyContinue | Select-Object -First 3 Id, ProcessName, StartTime | Format-Table -AutoSize | Out-String
  exit 1
}
