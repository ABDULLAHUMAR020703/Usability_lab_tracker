# Builds a self-contained Windows package: release\ConsumerInsightsHub\ConsumerInsightsHub.exe
# The package includes its own Node.js runtime, so the target laptop needs nothing installed.
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File scripts\build-portable.ps1
param([switch]$WithExe)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$out = Join-Path $root 'release\ConsumerInsightsHub'
$app = Join-Path $out 'app'

Write-Host '1/6 Building interface...'
npm --prefix frontend install --no-audit --no-fund | Out-Null
npm --prefix frontend run build
if ($LASTEXITCODE) { throw 'Frontend build failed' }

Write-Host '2/6 Preparing folders...'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$app\backend", "$app\frontend", "$out\runtime" | Out-Null

Write-Host '3/6 Copying application...'
foreach ($d in 'routes', 'services', 'database', 'utils') { Copy-Item "backend\$d" "$app\backend\$d" -Recurse }
Copy-Item backend\server.js, backend\config.js, backend\package.json "$app\backend"
if (Test-Path backend\package-lock.json) { Copy-Item backend\package-lock.json "$app\backend" }
Copy-Item frontend\dist "$app\frontend\dist" -Recurse
Copy-Item .env.example "$app\.env.example"
# Data lives next to the exe (not inside app\) so the app folder can be replaced on upgrades.
@"
PORT=4000
HOST=127.0.0.1
DATA_DIR=../data
STORAGE_DIR=../storage
BACKUP_DIR=../backups
MAX_UPLOAD_MB=100
"@ | Set-Content "$app\.env" -Encoding ascii
npm --prefix "$app\backend" install --omit=dev --no-audit --no-fund | Out-Null
if ($LASTEXITCODE) { throw 'Backend install failed' }

Write-Host '4/6 Copying Node runtime...'
Copy-Item (Get-Command node).Source "$out\runtime\node.exe"

Write-Host '5/6 Writing launchers...'
if ($WithExe) {
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(224, 36, 36))), 8, 8, 240, 240)
$f = New-Object System.Drawing.Font 'Segoe UI', 96, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
$g.DrawString('CI', $f, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 0, 256, 256), $sf)
$g.Dispose()
$ms = New-Object System.IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $png = $ms.ToArray()
$ico = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ico
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]1)
$w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0); $w.Write([uint16]1); $w.Write([uint16]32)
$w.Write([uint32]$png.Length); $w.Write([uint32]22); $w.Write($png); $w.Flush()
$icoPath = Join-Path $root 'launcher\app.ico'
[System.IO.File]::WriteAllBytes($icoPath, $ico.ToArray())
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:winexe /optimize "/win32icon:$icoPath" "/out:$out\ConsumerInsightsHub.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll launcher\Launcher.cs
if ($LASTEXITCODE) { throw 'Launcher compile failed' }
}


# Script launchers (no unsigned exe, so corporate antivirus does not block them)
@"
@echo off
cd /d "%~dp0"
curl.exe -s -m 2 http://localhost:4000/api/health >nul 2>nul && (start "" http://localhost:4000 & exit /b)
if not exist "runtime\node.exe" (echo runtime\node.exe is missing - keep this file with the app and runtime folders & pause & exit /b 1)
set CIH_LAUNCHER=1
cd app
start "Consumer Insights Hub (close or use Stop to quit)" /min "..\runtime\node.exe" --disable-warning=ExperimentalWarning backend\server.js
cd ..
for /l %%i in (1,1,30) do (
  curl.exe -s -m 2 http://localhost:4000/api/health >nul 2>nul && goto up
  timeout /t 1 /nobreak >nul
)
echo The application did not start. Is port 4000 used by another program? & pause & exit /b 1
:up
start "" http://localhost:4000
"@ | Set-Content "$out\Start Consumer Insights Hub.bat" -Encoding ascii
@"
@echo off
curl.exe -s -m 5 -X POST http://localhost:4000/__shutdown >nul 2>nul && echo Consumer Insights Hub stopped. || echo It was not running.
timeout /t 2 /nobreak >nul
"@ | Set-Content "$out\Stop Consumer Insights Hub.bat" -Encoding ascii
Write-Host '6/6 Writing instructions...'
@"
Consumer Insights Hub
=====================
Double-click "Start Consumer Insights Hub.bat". The app opens in your browser (http://localhost:4000).
A small minimised window stays on the taskbar while it runs. To stop the app, double-click
"Stop Consumer Insights Hub.bat" (or close that window). Tip: right-click the Start file -> Send to -> Desktop (shortcut).

Nothing needs to be installed. Keep these together in one folder:
  the two .bat files, app\, runtime\
Your data is created next to them:  data\ (database)  storage\ (files, signed NDAs)  backups\
To move to another laptop: copy the whole folder (with data, storage, backups) while the app is stopped.

First steps: Settings -> upload your approved NDA template; Backups -> set the folder to an external drive.
For NDA PDFs with full formatting, Microsoft Word or LibreOffice must be installed on the laptop.
"@ | Set-Content "$out\READ ME FIRST.txt" -Encoding ascii

"{0:N0} MB" -f ((Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum / 1MB) | ForEach-Object { Write-Host "Done: $out ($_)" }

