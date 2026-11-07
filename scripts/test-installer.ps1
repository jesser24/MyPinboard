# Silent install -> launch -> uninstall test of the real NSIS installer, plus PE architecture checks. Windows PowerShell 5.1.
param([Parameter(Mandatory)][string]$Setup, [Parameter(Mandatory)][string]$OutDir)
$ErrorActionPreference = "Stop"; New-Item -ItemType Directory -Force $OutDir | Out-Null
$tmp = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$dir = Join-Path $tmp "MyPinboard-installed"; Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
$data = Join-Path $tmp "mp-installer-data"; New-Item -ItemType Directory -Force $data | Out-Null; Set-Content (Join-Path $data "marker.txt") "user data must survive uninstall"
$env:MYPINBOARD_DATA_DIR = $data
$rows = New-Object System.Collections.ArrayList; $script:failed = 0
function Check([string]$n, [bool]$ok, [string]$d = "") { [void]$rows.Add([pscustomobject]@{ check = $n; result = $(if ($ok) { "PASS" } else { "FAIL" }); detail = $d }); Write-Host ("{0} {1} {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $n, $d); if (-not $ok) { $script:failed++ } }
function Machine([string]$f) { $b = [IO.File]::ReadAllBytes($f); $pe = [BitConverter]::ToInt32($b, 0x3C); $m = [BitConverter]::ToUInt16($b, $pe + 4); switch ($m) { 0x8664 { "x64" } 0x014c { "x86" } 0xAA64 { "arm64" } default { "0x{0:x}" -f $m } } }

Check "installer file exists and is a real executable (> 1 MB)" ((Test-Path $Setup) -and ((Get-Item $Setup).Length -gt 1MB)) "$((Get-Item $Setup).Length) bytes"
Start-Process -FilePath $Setup -ArgumentList "/S", "/D=$dir" -Wait
$exe = Get-ChildItem $dir -Filter "*.exe" -ErrorAction SilentlyContinue | Where-Object { $_.Name -imatch "^mypinboard\.exe$" } | Select-Object -First 1
Check "silent install put MyPinboard.exe in the chosen directory" ($null -ne $exe) $dir
if ($exe) { Check "installed application is x64" ((Machine $exe.FullName) -eq "x64") (Machine $exe.FullName) }
Check "uninstaller was installed" (Test-Path (Join-Path $dir "uninstall.exe")) ""
$lnk = Get-ChildItem (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs") -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "MyPinboard*" }
Check "Start Menu shortcut created" (@($lnk).Count -ge 1) (($lnk | ForEach-Object FullName) -join "; ")
$reg = Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue | Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -like "MyPinboard*" }
Check "listed in Apps & features (uninstall registry entry)" (@($reg).Count -ge 1) ""
if ($exe) {
  $p = Start-Process -FilePath $exe.FullName -PassThru; Start-Sleep -Seconds 8
  Check "installed application starts and stays running" (-not $p.HasExited) ""
  Start-Process -FilePath "taskkill.exe" -ArgumentList "/IM", $exe.Name, "/T", "/F" -Wait -WindowStyle Hidden; Start-Sleep -Seconds 2
}
$un = Join-Path $dir "uninstall.exe"
if (Test-Path $un) { Start-Process -FilePath $un -ArgumentList "/S" -Wait; for ($i = 0; $i -lt 30 -and (Test-Path (Join-Path $dir "MyPinboard.exe")); $i++) { Start-Sleep -Seconds 1 } }
Check "uninstall removed the application" (-not (Test-Path (Join-Path $dir "MyPinboard.exe"))) ""
Check "uninstall preserved user data" (Test-Path (Join-Path $data "marker.txt")) ""
$lnk2 = Get-ChildItem (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs") -Recurse -Filter "MyPinboard*.lnk" -ErrorAction SilentlyContinue
Check "uninstall removed the Start Menu shortcut" (@($lnk2).Count -eq 0) ""
$md = @("## Installer test", "", "| Check | Result | Detail |", "|---|---|---|") + ($rows | ForEach-Object { "| $($_.check) | $($_.result) | $($_.detail) |" })
$md | Set-Content (Join-Path $OutDir "installer.md"); if ($env:GITHUB_STEP_SUMMARY) { $md | Add-Content $env:GITHUB_STEP_SUMMARY }
$rows | ConvertTo-Json | Set-Content (Join-Path $OutDir "installer.json")
exit $(if ($script:failed -gt 0) { 1 } else { 0 })
