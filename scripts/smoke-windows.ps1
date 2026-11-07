# Real-Windows smoke test of the built application. Run by CI with Windows PowerShell 5.1 (STA, needed for the image clipboard).
# Launches the actual exe, uses the real clipboard and real windows, measures memory/CPU, captures real screenshots, and verifies persistence after restart.
param([Parameter(Mandatory)][string]$Exe, [Parameter(Mandatory)][string]$OutDir)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$tmp = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$data = Join-Path $tmp "mp-smoke-data"; Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue
$env:MYPINBOARD_DATA_DIR = $data
$rows = New-Object System.Collections.ArrayList; $script:failed = 0
function Check([string]$name, [bool]$ok, [string]$detail = "") {
  [void]$rows.Add([pscustomobject]@{ check = $name; result = $(if ($ok) { "PASS" } else { "FAIL" }); detail = $detail })
  Write-Host ("{0} {1} {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $name, $detail); if (-not $ok) { $script:failed++ }
}
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Win {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static List<string> Windows(uint[] pids) {
    var res = new List<string>();
    EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid);
      if (Array.IndexOf(pids, pid) >= 0) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); RECT r; GetWindowRect(h, out r);
        res.Add(sb.ToString() + "|" + (IsWindowVisible(h) ? 1 : 0) + "|" + r.Left + "," + r.Top + "," + r.Right + "," + r.Bottom); }
      return true; }, IntPtr.Zero);
    return res; }
}
"@
function Get-Tree([int]$root) {
  $all = Get-CimInstance Win32_Process; $ids = @($root); $queue = @($root)
  while ($queue.Count) { $cur = $queue[0]; $queue = $queue[1..($queue.Count)] ; foreach ($c in ($all | Where-Object { $_.ParentProcessId -eq $cur })) { $ids += [int]$c.ProcessId; $queue += [int]$c.ProcessId } }
  $ids | Select-Object -Unique
}
function Tree-Stats([int]$root) {
  $ps = Get-Tree $root | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_ }
  [pscustomobject]@{ processes = @($ps).Count; workingSetMB = [math]::Round((($ps | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 1);
    privateMB = [math]::Round((($ps | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB, 1); cpuSeconds = [math]::Round((($ps | ForEach-Object { $_.TotalProcessorTime.TotalSeconds } | Measure-Object -Sum).Sum), 3) }
}
function Window-List([int]$root) { [Win]::Windows([uint32[]](Get-Tree $root)) | ForEach-Object { $t = $_.Split("|"); $r = $t[2].Split(",") | ForEach-Object { [int]$_ }
  [pscustomobject]@{ title = $t[0]; visible = ($t[1] -eq "1"); l = $r[0]; t = $r[1]; r = $r[2]; b = $r[3] } }
}
function Stats([string]$file) { Start-Process -FilePath $Exe -ArgumentList "--print-stats", "`"$file`"" -Wait -WindowStyle Hidden; if (Test-Path $file) { Get-Content $file -Raw | ConvertFrom-Json } else { $null } }
function Shot([string]$name) { try { $b = [System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size); $bmp.Save((Join-Path $OutDir $name)); $g.Dispose(); $bmp.Dispose(); $true } catch { Write-Host "screenshot failed: $_"; $false } }

$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$scr = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Host "Primary work area: $($wa.Left),$($wa.Top) $($wa.Width)x$($wa.Height)  bounds $($scr.Width)x$($scr.Height)"

# ---- 1. start ----
$p = Start-Process -FilePath $Exe -PassThru; Start-Sleep -Seconds 8
Check "application starts and keeps running" (-not $p.HasExited) "pid $($p.Id)"
$w = Window-List $p.Id
$handle = $w | Where-Object { $_.title -eq "MyPinboard handle" -and $_.visible } | Select-Object -First 1
Check "edge handle window exists and is visible" ($null -ne $handle) (($w | ForEach-Object { "$($_.title)/$($_.visible)" }) -join "; ")
if ($handle) {
  $inside = ($handle.l -ge $wa.Left) -and ($handle.t -ge $wa.Top) -and ($handle.r -le $wa.Right) -and ($handle.b -le $wa.Bottom)
  Check "handle is fully inside the work area" $inside "$($handle.l),$($handle.t),$($handle.r),$($handle.b)"
  Check "handle is attached to the right edge (default)" ($handle.r -eq $wa.Right) "right=$($handle.r) workRight=$($wa.Right)"
  Check "handle is a thin tab" (($handle.r - $handle.l) -le 40) "width=$($handle.r - $handle.l)"
}
Check "board webview is NOT running before first use (light background footprint)" (-not ($w | Where-Object { $_.title -eq "MyPinboard" })) ""
Shot "handle-only.png" | Out-Null

# ---- 2. real clipboard capture while the board is closed ----
$token = "smoke-" + [guid]::NewGuid().ToString("N").Substring(0, 12)
Set-Clipboard -Value $token; Start-Sleep -Seconds 3
$s1 = Stats (Join-Path $OutDir "stats-1.json")
Check "copied TEXT was captured while the board is closed" ($s1 -and ($s1.titles -contains $token)) "items=$($s1.items)"
$f = Join-Path $tmp "smoke-file-$token.txt"; Set-Content $f "hello"; Set-Clipboard -Path $f; Start-Sleep -Seconds 3
$s2 = Stats (Join-Path $OutDir "stats-2.json")
Check "copied FILE was captured as a file reference" ($s2 -and ($s2.kinds -contains "file") -and ($s2.titles -contains (Split-Path $f -Leaf))) "kinds=$($s2.kinds -join ',')"
$bmp = New-Object System.Drawing.Bitmap 64, 64; $gg = [System.Drawing.Graphics]::FromImage($bmp); $gg.Clear([System.Drawing.Color]::MediumPurple); $gg.Dispose()
[System.Windows.Forms.Clipboard]::SetImage($bmp); Start-Sleep -Seconds 3
$s3 = Stats (Join-Path $OutDir "stats-3.json")
Check "copied IMAGE was captured" ($s3 -and ($s3.kinds -contains "image")) "kinds=$($s3.kinds -join ',')"
Set-Clipboard -Value $token; Start-Sleep -Seconds 2
$s4 = Stats (Join-Path $OutDir "stats-4.json")
Check "copying the same text again does not create a duplicate" ($s4.items -eq $s3.items) "before=$($s3.items) after=$($s4.items)"
Check "images are stored as files under the data folder" ((Get-ChildItem (Join-Path $data "images") -Filter *.png -ErrorAction SilentlyContinue | Measure-Object).Count -ge 1) ""
Check "database file exists in the data folder" (Test-Path (Join-Path $data "mypinboard.db")) $data

# ---- 3. idle footprint (board never opened) ----
Start-Sleep -Seconds 10; $m0 = Tree-Stats $p.Id; Start-Sleep -Seconds 10; $m1 = Tree-Stats $p.Id
$cores = [Environment]::ProcessorCount; $cpuPct = [math]::Round((($m1.cpuSeconds - $m0.cpuSeconds) / 10.0 / $cores) * 100, 2)
Write-Host "IDLE (board closed): $($m1.processes) processes, working set $($m1.workingSetMB) MB, private $($m1.privateMB) MB, CPU $cpuPct % of $cores cores"
Check "idle CPU is low over 10s (< 3% of total CPU)" ($cpuPct -lt 3) "$cpuPct %"
$idle = $m1

# ---- 4. open the board (second launch is forwarded to the running instance) ----
$p2 = Start-Process -FilePath $Exe -PassThru; Start-Sleep -Seconds 7
Check "second launch exits (single instance)" ($p2.HasExited -or (Get-Process -Id $p2.Id -ErrorAction SilentlyContinue | Where-Object { -not $_.HasExited } | Measure-Object).Count -eq 0) ""
Check "only one MyPinboard process remains" ((Get-Process | Where-Object { $_.ProcessName -ieq [IO.Path]::GetFileNameWithoutExtension($Exe) } | Measure-Object).Count -eq 1) ""
$w = Window-List $p.Id
$board = $w | Where-Object { $_.title -eq "MyPinboard" -and $_.visible } | Select-Object -First 1
Check "board window opens" ($null -ne $board) ""
if ($board) {
  $bin = ($board.l -ge $wa.Left) -and ($board.t -ge $wa.Top) -and ($board.r -le $wa.Right) -and ($board.b -le $wa.Bottom)
  Check "board is fully on screen" $bin "$($board.l),$($board.t),$($board.r),$($board.b)"
  if ($handle) { $ov = ($handle.l -lt $board.r) -and ($handle.r -gt $board.l) -and ($handle.t -lt $board.b) -and ($handle.b -gt $board.t); Check "board does not overlap the handle" (-not $ov) "" }
}
Start-Sleep -Seconds 1; $shotOk = Shot "board-open.png"; $open = Tree-Stats $p.Id
Write-Host "BOARD OPEN: $($open.processes) processes, working set $($open.workingSetMB) MB, private $($open.privateMB) MB"
[System.Windows.Forms.SendKeys]::SendWait("{ESC}"); Start-Sleep -Seconds 3
$w = Window-List $p.Id; Check "Escape closes the board" (-not ($w | Where-Object { $_.title -eq "MyPinboard" -and $_.visible })) "(needs the board to have keyboard focus; see notes if this is the only failure)"

# ---- 5. persistence across restart, then single-instance relaunch ----
Start-Process -FilePath "taskkill.exe" -ArgumentList "/PID", $p.Id, "/T", "/F" -Wait -WindowStyle Hidden; Start-Sleep -Seconds 2
$p = Start-Process -FilePath $Exe -PassThru; Start-Sleep -Seconds 8
Check "application restarts after being killed" (-not $p.HasExited) ""
$s5 = Stats (Join-Path $OutDir "stats-5.json")
Check "data survived the restart (SQLite)" ($s5 -and $s5.items -eq $s3.items -and ($s5.titles -contains $token)) "items=$($s5.items)"
$p3 = Start-Process -FilePath $Exe -PassThru; Start-Sleep -Seconds 3
Set-Clipboard -Value ("after-restart-" + $token); Start-Sleep -Seconds 3
$s6 = Stats (Join-Path $OutDir "stats-6.json")
Check "clipboard capture works again after restart" ($s6 -and ($s6.titles -contains ("after-restart-" + $token))) ""
Start-Process -FilePath "taskkill.exe" -ArgumentList "/IM", ([IO.Path]::GetFileName($Exe)), "/T", "/F" -Wait -WindowStyle Hidden

# ---- report ----
$report = [ordered]@{ failed = $script:failed; screenshotCaptured = $shotOk; workArea = "$($wa.Width)x$($wa.Height)"; idle = $idle; boardOpen = $open; idleCpuPercent = $cpuPct; cores = $cores; checks = $rows }
$report | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "smoke.json")
$md = @("## Windows smoke test", "", "| Check | Result | Detail |", "|---|---|---|") + ($rows | ForEach-Object { "| $($_.check) | $($_.result) | $($_.detail) |" }) +
  @("", "**Footprint (board never opened):** $($idle.processes) processes, working set $($idle.workingSetMB) MB, private $($idle.privateMB) MB, CPU $cpuPct % of total ($cores cores).",
    "**Board open:** $($open.processes) processes, working set $($open.workingSetMB) MB, private $($open.privateMB) MB.")
$md | Set-Content (Join-Path $OutDir "smoke.md"); if ($env:GITHUB_STEP_SUMMARY) { $md | Add-Content $env:GITHUB_STEP_SUMMARY }
exit $(if ($script:failed -gt 0) { 1 } else { 0 })
