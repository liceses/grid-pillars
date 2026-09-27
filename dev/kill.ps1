$ErrorActionPreference = 'Stop'
$ud = Join-Path $env:TEMP 'edge-gp-live'
$mine = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$ud*" }
if (-not $mine) { 'no live browser running'; exit 0 }
$mine | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 700
$allowed = [System.IO.Path]::GetFullPath($env:TEMP)
$full = [System.IO.Path]::GetFullPath($ud)
if ($full.StartsWith($allowed, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full)) {
  Remove-Item -LiteralPath $full -Recurse -Force
}
"closed live browser ($($mine.Count) processes) and removed its profile"
