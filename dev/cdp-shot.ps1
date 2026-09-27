param(
  [string]$Url  = 'file:///D:/developing/webdesign/grid-pillars/index.html',
  [string]$Out  = 'D:\developing\webdesign\grid-pillars\.dsh\shot.png',
  [int]$Wait    = 5000,
  [int]$W       = 1600,
  [int]$H       = 900,
  [string]$Probe = '',
  [int]$Port    = 9333
)
$ErrorActionPreference = 'Stop'

# 只清理"自己这一类"实例：带 --headless 或 edge-cdp-/edge-verify- 临时配置目录的 msedge。
# 你日常的 Edge 没有这些特征，不会被碰到。
function Clear-StaleHeadless {
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and ($_.CommandLine -match '--headless' -or
                           $_.CommandLine -match 'edge-cdp-' -or
                           $_.CommandLine -match 'edge-verify-')
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
Clear-StaleHeadless   # 先清上次的残留，避免进程堆积

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edge)) { throw 'edge not found' }

$ud = Join-Path $env:TEMP ('edge-cdp-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$eo = @(
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-sync', '--disable-background-networking', '--mute-audio', '--no-sandbox',
  "--user-data-dir=$ud",
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  "--window-size=$W,$H",
  "--remote-debugging-port=$Port",
  'about:blank'
)
$browser = Start-Process -FilePath $edge -ArgumentList $eo -PassThru

try {
  $env:CDP_PORT = "$Port"
  node 'D:\developing\webdesign\grid-pillars\dev\shoot.js' $Url $Out $Wait $W $H $Probe
  $code = $LASTEXITCODE
} finally {
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$ud*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Clear-StaleHeadless   # 再兜一次底，确保不留孤儿进程
}
exit $code
