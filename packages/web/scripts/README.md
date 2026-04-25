# Dev scripts

## dev-startup.ps1

One-shot startup for Etalo local stack + ngrok tunnel for MiniPay testing.

### Prerequisites

- Python venv at `packages/backend/venv` with deps installed
- Node modules installed in `packages/web` (`npm install`)
- `ngrok` in PATH, configured with auth token if applicable
- (Optional) Reserved ngrok subdomain on free/paid tier — URL stays stable

### Run

```powershell
cd C:\Users\Oxfam\projects\etalo
.\packages\web\scripts\dev-startup.ps1
```

### What it does

1. Kills zombies on ports 3000 + 8000 + any ngrok agent
2. Starts backend (FastAPI) in minimized window
3. Starts frontend (Next.js) in minimized window
4. Waits for both to be reachable (60s timeout)
5. Starts ngrok tunnel (`ngrok http 127.0.0.1:3000`)
6. Captures HTTPS URL via ngrok local API
7. Writes `.env.local` with ngrok-aware vars

### Then in MiniPay

Open the printed URL in MiniPay Developer Mode. First visit shows the
ngrok-free interstitial — click "Visit Site" once. Subsequent navigation
works because the cookie is set in WebView. API fetches bypass the
interstitial via the `ngrok-skip-browser-warning` header injected by
`lib/fetch-api.ts`.

### Stop

Close the 3 minimized windows (backend, frontend, ngrok), or:

```powershell
Get-Process ngrok,node,python | Stop-Process -Force
```

## dev-ngrok.ps1

Standalone helper to capture an existing ngrok URL and update `.env.local`.
Use when ngrok is already running and you just need to refresh the env.

```powershell
.\packages\web\scripts\dev-ngrok.ps1
```

## Execution policy

If PowerShell blocks the scripts:

```powershell
# One-time per user (recommended)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or per-invocation
powershell -ExecutionPolicy Bypass -File .\packages\web\scripts\dev-startup.ps1
```
