# Etalo dev environment startup
# One command to launch backend, frontend, ngrok in Windows Terminal tabs
param([switch]$NoCleanup)

$ErrorActionPreference = "Stop"
$repoRoot = "C:\Users\Oxfam\projects\etalo"

if (-not (Test-Path $repoRoot)) {
    Write-Error "Repo not found at $repoRoot. Adjust path in script."
    exit 1
}

# 1. Kill zombies on ports 3000, 8000 + ngrok process
if (-not $NoCleanup) {
    Write-Host "Cleaning up zombie processes..." -ForegroundColor Yellow
    foreach ($port in @(3000, 8000)) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $conns) {
            try {
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
                Write-Host "  Killed PID $($conn.OwningProcess) on :$port"
            } catch {}
        }
    }
    Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# 2. Check Windows Terminal available
$wtPath = (Get-Command wt -ErrorAction SilentlyContinue).Source
if (-not $wtPath) {
    Write-Error "Windows Terminal (wt) not found. Install from Microsoft Store."
    exit 1
}

# 3. Open Windows Terminal with backend tab first (creates new window)
$backendDir = Join-Path $repoRoot "packages\backend"
$webDir = Join-Path $repoRoot "packages\web"

Write-Host "Opening Windows Terminal with backend tab..." -ForegroundColor Cyan
Start-Process wt -ArgumentList @(
    "new-tab",
    "--title", "Etalo-Backend",
    "-d", $backendDir,
    "cmd", "/k", ".\venv\Scripts\python.exe scripts\run_dev.py"
)

# Wait for window to appear before adding tabs
Start-Sleep -Seconds 2

# 4. Add frontend tab to the same window (window 0 = most recent)
Write-Host "Adding frontend tab..."
Start-Process wt -ArgumentList @(
    "-w", "0",
    "new-tab",
    "--title", "Etalo-Frontend",
    "-d", $webDir,
    "cmd", "/k", "npm run dev"
)

Start-Sleep -Seconds 1

# 5. Add ngrok tab
Write-Host "Adding ngrok tab..."
Start-Process wt -ArgumentList @(
    "-w", "0",
    "new-tab",
    "--title", "Etalo-ngrok",
    "cmd", "/k", "ngrok http 127.0.0.1:3000"
)

Write-Host ""
Write-Host "Etalo dev environment starting in Windows Terminal." -ForegroundColor Green
Write-Host "  Tab 1 (Backend)  : http://127.0.0.1:8000"
Write-Host "  Tab 2 (Frontend) : http://127.0.0.1:3000"
Write-Host "  Tab 3 (ngrok)    : https://upright-henna-armless.ngrok-free.dev"
Write-Host ""
Write-Host "Stop all services: .\etalo-stop.ps1 (or close the Windows Terminal window)"
