$ErrorActionPreference = "Stop"

$projectDirectory = "C:\Users\Besco\OneDrive\Escritorio\DESARROLLOS\SistemasDeCitas"
$logDirectory = Join-Path $projectDirectory ".codex-logs"

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$apiIsRunning = Get-NetTCPConnection -State Listen -LocalPort 4000 -ErrorAction SilentlyContinue
if ($apiIsRunning) {
  exit 0
}

Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev") `
  -WorkingDirectory $projectDirectory `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDirectory "application.out.log") `
  -RedirectStandardError (Join-Path $logDirectory "application.err.log")
