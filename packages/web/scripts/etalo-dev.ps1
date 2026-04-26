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

# 3. Build the wt command with 3 tabs
$backendDir = Join-Path $repoRoot "packages\backend"
$webDir = Join-Path $repoRoot "packages\web"

# Open Windows Terminal with 3 tabs:
# Tab 1: Backend (FastAPI)
# Tab 2: Frontend (Next.js)
# Tab 3: ngrok tunnel
$wtArgs = @(
    "-w", "0", "new-tab", "--title", "Etalo Backend", "-d", "`"$backendDir`"",
    "powershell", "-NoExit", "-Command", "& '.\venv\Scripts\python.exe' scripts\run_dev.py",
    ";", "new-tab", "--title", "Etalo Frontend", "-d", "`"$webDir`"",
    "powershell", "-NoExit", "-Command", "npm run dev",
    ";", "new-tab", "--title", "Etalo ngrok",
    "powershell", "-NoExit", "-Command", "ngrok http 127.0.0.1:3000"
)

Write-Host "Opening Windows Terminal with 3 tabs..." -ForegroundColor Cyan
Start-Process wt -ArgumentList $wtArgs

Write-Host ""
Write-Host "Etalo dev environment starting in Windows Terminal." -ForegroundColor Green
Write-Host "  Tab 1 (Backend)  : http://127.0.0.1:8000"
Write-Host "  Tab 2 (Frontend) : http://127.0.0.1:3000"
Write-Host "  Tab 3 (ngrok)    : https://upright-henna-armless.ngrok-free.dev"
Write-Host ""
Write-Host "Stop all services: .\etalo-stop.ps1 (or close the Windows Terminal window)"
