# etalo-dev-all.ps1
# One-command launcher for Etalo dev environment
# Spawns 3 Windows Terminal tabs : Backend + Frontend + ngrok
# All paths pinned to INNER canonical repo (hotfix #9 + #10 protected)
#
# Usage : depuis n'importe ou
#   C:\Users\Oxfam\projects\etalo\Etalo\packages\web\scripts\etalo-dev-all.ps1
#
# Or with $PROFILE alias (recommended) :
#   etalo-up

# === Configuration (INNER canonical paths) ===
$INNER_REPO = "C:\Users\Oxfam\projects\etalo\Etalo"
$BACKEND_DIR = "$INNER_REPO\packages\backend"
$WEB_DIR = "$INNER_REPO\packages\web"
$NGROK_DOMAIN = "upright-henna-armless.ngrok-free.dev"
$FRONTEND_PORT = 3000
$BACKEND_PORT = 8000

# === Banner ===
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Etalo Dev Environment Launcher" -ForegroundColor Green
Write-Host "  Backend + Frontend + ngrok in 3 tabs" -ForegroundColor Green
Write-Host "  INNER canonical repo (hotfix #9 + #10)" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

# === [1/4] Pre-flight cleanup ===
Write-Host "[1/4] Pre-flight : stopping existing dev processes..." -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# === [2/4] Verify INNER paths exist ===
Write-Host "[2/4] Verifying INNER repo paths..." -ForegroundColor Cyan

if (-not (Test-Path $BACKEND_DIR)) {
    Write-Host "ERROR : Backend directory not found at $BACKEND_DIR" -ForegroundColor Red
    Write-Host "Expected inner canonical path. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $WEB_DIR)) {
    Write-Host "ERROR : Web directory not found at $WEB_DIR" -ForegroundColor Red
    Write-Host "Expected inner canonical path. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "$BACKEND_DIR\venv\Scripts\Activate.ps1")) {
    Write-Host "WARNING : Backend venv not found at $BACKEND_DIR\venv" -ForegroundColor Yellow
    Write-Host "Run 'python -m venv venv' in $BACKEND_DIR first if backend tab fails." -ForegroundColor Yellow
}

# === [3/4] Verify ports free ===
Write-Host "[3/4] Verifying ports $FRONTEND_PORT + $BACKEND_PORT free..." -ForegroundColor Cyan

$port3000Busy = netstat -ano | Select-String ":$FRONTEND_PORT\s.*LISTENING"
$port8000Busy = netstat -ano | Select-String ":$BACKEND_PORT\s.*LISTENING"

if ($port3000Busy) {
    Write-Host "WARNING : Port $FRONTEND_PORT still in use. Frontend may fail to bind." -ForegroundColor Yellow
}
if ($port8000Busy) {
    Write-Host "WARNING : Port $BACKEND_PORT still in use. Backend may fail to bind." -ForegroundColor Yellow
}

# === [4/4] Launch services ===
Write-Host "[4/4] Launching 3 services..." -ForegroundColor Cyan

# Build commands as PowerShell -Command strings
# Note : backtick avant $env protege contre expansion premature
# Note : \; escape inner semicolons so wt does not interpret them as subcommand
# separators (wt unescape \; -> ; before passing to inner powershell -Command)
$backendCmd = "& '.\venv\Scripts\Activate.ps1'\; python scripts\run_dev.py"
$frontendCmd = "`$env:NEXT_PUBLIC_DEV_ROUTES='true'\; pnpm dev"
$ngrokCmd = "ngrok http --domain=$NGROK_DOMAIN $FRONTEND_PORT"

# Detect Windows Terminal
$wt = Get-Command wt -ErrorAction SilentlyContinue

if ($wt) {
    Write-Host "  -> Windows Terminal detected, spawning 3 tabs" -ForegroundColor Green

    # 3 separate Start-Process wt calls with -w 0 for tabs 2/3 (J7 proven pattern,
    # avoids `; escape-on-newline footgun of multi-line wt single-invocation)

    # Note : titles use hyphen (no space) — Start-Process -ArgumentList does not
    # reliably quote argv elements containing spaces, wt would split "Etalo Backend"
    # into title="Etalo" + command="Backend" and fail.

    # Tab 1 (Backend) — creates new wt window
    Start-Process wt -ArgumentList @(
        "new-tab", "--title", "Etalo-Backend", "-d", $BACKEND_DIR,
        "powershell", "-NoExit", "-Command", $backendCmd
    )
    Start-Sleep -Seconds 2

    # Tab 2 (Frontend) — -w 0 targets the wt window we just opened
    Start-Process wt -ArgumentList @(
        "-w", "0", "new-tab", "--title", "Etalo-Frontend", "-d", $WEB_DIR,
        "powershell", "-NoExit", "-Command", $frontendCmd
    )
    Start-Sleep -Seconds 1

    # Tab 3 (ngrok)
    Start-Process wt -ArgumentList @(
        "-w", "0", "new-tab", "--title", "Etalo-ngrok", "-d", $INNER_REPO,
        "powershell", "-NoExit", "-Command", $ngrokCmd
    )
} else {
    Write-Host "  -> Windows Terminal not found, fallback to 3 separate windows" -ForegroundColor Yellow

    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        "`$Host.UI.RawUI.WindowTitle = 'Etalo Backend'; Set-Location '$BACKEND_DIR'; & '.\venv\Scripts\Activate.ps1'; python scripts\run_dev.py"
    )

    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        "`$Host.UI.RawUI.WindowTitle = 'Etalo Frontend'; Set-Location '$WEB_DIR'; `$env:NEXT_PUBLIC_DEV_ROUTES='true'; pnpm dev"
    )

    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        "`$Host.UI.RawUI.WindowTitle = 'Etalo ngrok'; Set-Location '$INNER_REPO'; ngrok http --domain=$NGROK_DOMAIN $FRONTEND_PORT"
    )
}

# === Final summary ===
Write-Host ""
Write-Host "Etalo dev environment launching :" -ForegroundColor Green
Write-Host ""
Write-Host "  Backend  -> http://127.0.0.1:$BACKEND_PORT" -ForegroundColor White
Write-Host "             Attendu : 'Running backend from CANONICAL inner repo'" -ForegroundColor Gray
Write-Host ""
Write-Host "  Frontend -> http://localhost:$FRONTEND_PORT" -ForegroundColor White
Write-Host "             Attendu : '=== Canonical inner repo Phase 4 hotfix #9 banner ==='" -ForegroundColor Gray
Write-Host ""
Write-Host "  ngrok    -> https://$NGROK_DOMAIN" -ForegroundColor White
Write-Host "             Domain persistant (MiniPay app pas re-config)" -ForegroundColor Gray
Write-Host ""
Write-Host "Wait ~60s for Frontend first compile, then open MiniPay on phone." -ForegroundColor Cyan
Write-Host "To stop : close the 3 tabs/windows OR Ctrl+C in each." -ForegroundColor Cyan
Write-Host ""
