#Requires -Version 5.1
<#
.SYNOPSIS
  One-shot startup for Etalo dev environment + ngrok tunnel.

.DESCRIPTION
  Orchestrates the full local stack for testing in MiniPay Developer Mode:
    1. Kills any zombie processes on ports 3000 (frontend) and 8000 (backend)
       and any zombie ngrok agents.
    2. Starts backend FastAPI in a new minimized window.
    3. Starts frontend Next.js in a new minimized window.
    4. Waits for both services to be reachable.
    5. Starts ngrok tunnel for 127.0.0.1:3000 in a new minimized window.
    6. Polls ngrok local API to capture the HTTPS public URL.
    7. Updates packages/web/.env.local with the ngrok URL + ngrok-aware vars.
    8. Prints the URL to paste in MiniPay Developer Mode.

  All windows minimized so user keeps focus on this terminal. Ctrl+C does
  NOT kill children (Windows limitation); use Stop-Process or close windows
  manually.

.PARAMETER NoCleanup
  Skip the zombie cleanup step (useful if you started services manually).

.EXAMPLE
  .\scripts\dev-startup.ps1
  .\scripts\dev-startup.ps1 -NoCleanup
#>

param([switch]$NoCleanup)

$ErrorActionPreference = "Stop"
$webDir = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $webDir)
$backendDir = Join-Path $repoRoot "packages/backend"

Write-Host "=== Etalo dev-startup ===" -ForegroundColor Cyan

# 1. Cleanup zombies
if (-not $NoCleanup) {
  Write-Host ""
  Write-Host "[1/6] Cleaning up zombie processes..." -ForegroundColor Yellow

  foreach ($port in @(3000, 8000)) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
      try {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction Stop
        Write-Host "  Killing PID $($conn.OwningProcess) ($($proc.ProcessName)) on port $port"
        Stop-Process -Id $conn.OwningProcess -Force
      } catch {}
    }
  }

  Get-Process ngrok -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  Killing ngrok PID $($_.Id)"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }

  Start-Sleep -Seconds 2
}

# 2. Start backend
Write-Host ""
Write-Host "[2/6] Starting backend on :8000..." -ForegroundColor Yellow
$backendPython = Join-Path $backendDir "venv/Scripts/python.exe"
if (-not (Test-Path $backendPython)) {
  Write-Error "Backend venv not found at $backendPython. Run: cd packages/backend; python -m venv venv; pip install -r requirements.txt"
  exit 1
}

Start-Process -FilePath $backendPython `
  -ArgumentList "scripts/run_dev.py" `
  -WorkingDirectory $backendDir `
  -WindowStyle Minimized

# 3. Start frontend
Write-Host "[3/6] Starting frontend on :3000..." -ForegroundColor Yellow
# Use cmd.exe wrapper because npm.cmd is a batch file (Start-Process npm
# directly fails with "the system cannot find the file specified" on Win).
Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "npm", "run", "dev" `
  -WorkingDirectory $webDir `
  -WindowStyle Minimized

# 4. Wait for both to be reachable
Write-Host "[4/6] Waiting for services to boot (poll up to 60s)..." -ForegroundColor Yellow
$deadline = (Get-Date).AddSeconds(60)
$backendReady = $false
$frontendReady = $false

while ((Get-Date) -lt $deadline) {
  if (-not $backendReady) {
    try {
      $r = Invoke-WebRequest "http://127.0.0.1:8000/api/v1/sitemap/data" `
        -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($r.StatusCode -eq 200) {
        Write-Host "  Backend ready" -ForegroundColor Green
        $backendReady = $true
      }
    } catch {}
  }
  if (-not $frontendReady) {
    try {
      $r = Invoke-WebRequest "http://127.0.0.1:3000" `
        -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($r.StatusCode -eq 200) {
        Write-Host "  Frontend ready" -ForegroundColor Green
        $frontendReady = $true
      }
    } catch {}
  }
  if ($backendReady -and $frontendReady) { break }
  Start-Sleep -Milliseconds 500
}

if (-not $backendReady) {
  Write-Error "Backend did not become ready within 60s. Check the backend window."
  exit 1
}
if (-not $frontendReady) {
  Write-Error "Frontend did not become ready within 60s. Check the frontend window."
  exit 1
}

# 5. Start ngrok
Write-Host "[5/6] Starting ngrok tunnel for 127.0.0.1:3000..." -ForegroundColor Yellow
Start-Process -FilePath "ngrok" `
  -ArgumentList "http", "127.0.0.1:3000" `
  -WindowStyle Minimized

Start-Sleep -Seconds 5

# 6. Capture ngrok URL via local API and update .env.local
Write-Host "[6/6] Capturing ngrok URL + updating .env.local..." -ForegroundColor Yellow

$tunnels = $null
$attempts = 0
while ($attempts -lt 10 -and -not $tunnels) {
  try {
    $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -TimeoutSec 2 -ErrorAction Stop
  } catch {
    $attempts++
    Start-Sleep -Seconds 1
  }
}
if (-not $tunnels) {
  Write-Error "Could not reach ngrok API. Is ngrok running?"
  exit 1
}

$ngrokUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1 -ExpandProperty public_url)
if (-not $ngrokUrl) {
  Write-Error "No HTTPS tunnel found in ngrok response."
  exit 1
}

# Update .env.local — merge mode: preserve all keys NOT in the managed
# set (including NEXT_PUBLIC_*_ADDRESS for V2 contracts), only update
# the 4 ngrok-related keys. Falls back to .env.example template if
# .env.local is missing.
$envPath = Join-Path $webDir ".env.local"
$envExamplePath = Join-Path $webDir ".env.example"

# Keys this script manages — all others are preserved as-is.
$managedKeys = [ordered]@{
  "NEXT_PUBLIC_API_URL"      = "/api/v1"
  "NEXT_PUBLIC_BASE_URL"     = $ngrokUrl
  "NEXT_PUBLIC_MINIAPP_URL"  = $ngrokUrl
  "LOCAL_API_REWRITE_TARGET" = "http://localhost:8000"
}

if (Test-Path $envPath) {
  $sourceLines = Get-Content $envPath
  Write-Host "  Merging into existing .env.local (preserving non-managed keys)"
} elseif (Test-Path $envExamplePath) {
  $sourceLines = Get-Content $envExamplePath
  Write-Host "  Bootstrapping .env.local from .env.example"
} else {
  $sourceLines = @()
  Write-Host "  Creating .env.local from scratch (no .env.example found)"
}

# Walk lines: replace managed keys in-place, otherwise keep as-is.
$seenKeys = @{}
$outputLines = foreach ($line in $sourceLines) {
  if ($line -match '^([A-Z_][A-Z0-9_]*)=') {
    $key = $matches[1]
    if ($managedKeys.Contains($key)) {
      $seenKeys[$key] = $true
      "$key=$($managedKeys[$key])"
    } else {
      $line
    }
  } else {
    # Comment or blank line — preserve.
    $line
  }
}

# Append any managed keys that weren't present in the source.
foreach ($key in $managedKeys.Keys) {
  if (-not $seenKeys.ContainsKey($key)) {
    $outputLines += "$key=$($managedKeys[$key])"
  }
}

Set-Content -Path $envPath -Value $outputLines -Encoding UTF8

Write-Host ""
Write-Host "=== READY ===" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://127.0.0.1:8000"
Write-Host "Frontend: http://127.0.0.1:3000"
Write-Host "Ngrok:    $ngrokUrl"
Write-Host ""
Write-Host "Test the rewrite from this machine:" -ForegroundColor Cyan
Write-Host "  curl.exe `"$ngrokUrl/api/v1/sitemap/data`" -H `"ngrok-skip-browser-warning: any`""
Write-Host ""
Write-Host "Open in MiniPay Developer Mode:" -ForegroundColor Cyan
Write-Host "  $ngrokUrl"
Write-Host ""
Write-Host "Note: Next.js dev server should pick up .env.local changes automatically."
Write-Host "If fetches return 404, restart the frontend window."
Write-Host ""
Write-Host "To stop everything: close the 3 minimized windows OR run:"
Write-Host "  Get-Process ngrok,node,python | Stop-Process -Force  # nuke option"
Write-Host ""
