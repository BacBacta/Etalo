#Requires -Version 5.1
<#
.SYNOPSIS
  Capture ngrok HTTPS URL and update packages/web/.env.local.

.DESCRIPTION
  Useful for testing Etalo in MiniPay Developer Mode. Assumes:
    - ngrok already started in another terminal: ngrok http 3000
    - backend running:  cd packages/backend; python scripts/run_dev.py
    - frontend running: cd packages/web; npm run dev

  This script polls ngrok's local API (localhost:4040) to grab the
  HTTPS public URL, then writes it into packages/web/.env.local as
  NEXT_PUBLIC_BASE_URL. It also sets NEXT_PUBLIC_API_URL=/api/v1 (so
  fetches go relative — the leading /api/v1 prefix is preserved per
  the lib code's path conventions) and LOCAL_API_REWRITE_TARGET to
  localhost:8000 so the rewrites in next.config.mjs proxy /api/* to
  the backend.

  Next.js dev server picks up env changes on the next request.

.NOTES
  Run from repo root or anywhere — paths resolve relative to this
  script:  .\packages\web\scripts\dev-ngrok.ps1

  If PowerShell blocks the script with an execution policy error, try:
    powershell -ExecutionPolicy Bypass -File .\packages\web\scripts\dev-ngrok.ps1
  Or once per user:
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#>

$ErrorActionPreference = "Stop"

# packages/web/.env.local lives one level up from packages/web/scripts/
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$webRoot = Split-Path -Parent $scriptDir
$envPath = Join-Path $webRoot ".env.local"

# --- 1. Poll the ngrok local API ---
Write-Host "Polling ngrok API at localhost:4040..." -ForegroundColor Cyan
$tunnels = $null
$attempts = 0
while ($attempts -lt 10 -and -not $tunnels) {
  try {
    $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" `
      -ErrorAction Stop -TimeoutSec 2
  } catch {
    $attempts++
    Start-Sleep -Seconds 1
  }
}
if (-not $tunnels) {
  Write-Error "Couldn't reach ngrok API after 10s. Is ngrok running? Try: ngrok http 3000"
  exit 1
}

$httpsTunnel = $tunnels.tunnels |
  Where-Object { $_.proto -eq "https" } |
  Select-Object -First 1

if (-not $httpsTunnel) {
  Write-Error "No HTTPS tunnel found. Make sure ngrok exposes :3000 (try: ngrok http 3000 --scheme=https)"
  exit 1
}

$ngrokUrl = $httpsTunnel.public_url
Write-Host "Found ngrok URL: $ngrokUrl" -ForegroundColor Green

# --- 2. Update .env.local ---
if (-not (Test-Path $envPath)) {
  Write-Host "Creating new .env.local at $envPath" -ForegroundColor Yellow
  New-Item -ItemType File -Path $envPath -Force | Out-Null
}

$envContent = Get-Content $envPath -ErrorAction SilentlyContinue
if (-not $envContent) { $envContent = @() }

$baseUrlSet = $false
$apiUrlSet = $false
$rewriteTargetSet = $false
$newContent = @()
foreach ($line in $envContent) {
  if ($line -match "^NEXT_PUBLIC_BASE_URL=") {
    $newContent += "NEXT_PUBLIC_BASE_URL=$ngrokUrl"
    $baseUrlSet = $true
  } elseif ($line -match "^NEXT_PUBLIC_API_URL=") {
    $newContent += "NEXT_PUBLIC_API_URL=/api/v1"
    $apiUrlSet = $true
  } elseif ($line -match "^LOCAL_API_REWRITE_TARGET=") {
    $newContent += "LOCAL_API_REWRITE_TARGET=http://localhost:8000"
    $rewriteTargetSet = $true
  } else {
    $newContent += $line
  }
}
if (-not $baseUrlSet) { $newContent += "NEXT_PUBLIC_BASE_URL=$ngrokUrl" }
if (-not $apiUrlSet) { $newContent += "NEXT_PUBLIC_API_URL=/api/v1" }
if (-not $rewriteTargetSet) { $newContent += "LOCAL_API_REWRITE_TARGET=http://localhost:8000" }

Set-Content -Path $envPath -Value $newContent -Encoding UTF8

Write-Host ""
Write-Host "Updated .env.local:" -ForegroundColor Green
Write-Host "  NEXT_PUBLIC_BASE_URL=$ngrokUrl"
Write-Host "  NEXT_PUBLIC_API_URL=/api/v1   (relative — Next.js rewrites proxy /api/* to localhost:8000)"
Write-Host "  LOCAL_API_REWRITE_TARGET=http://localhost:8000"
Write-Host ""
Write-Host "Next.js dev server picks up env changes on the next request." -ForegroundColor Cyan
Write-Host "If routes don't reflect the new env, restart npm run dev (Ctrl+C, then npm run dev)."
Write-Host ""
Write-Host "Open this URL in MiniPay Developer Mode:" -ForegroundColor Cyan
Write-Host "   $ngrokUrl"
Write-Host ""
