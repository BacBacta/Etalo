# Dev scripts

Canonical inner repo : `C:\Users\Oxfam\projects\etalo\Etalo\` (per Phase 4 hotfix #9 + #10, outer repo deleted Phase 5 Angle A Item 5).

## Usage matrix

| Use case | Script |
|---|---|
| Daily dev — 3 visible terminal tabs (Backend + Frontend + ngrok) | `etalo-dev-all.ps1` (canonical) |
| Silent dev — minimized windows + auto `.env.local` ngrok URL | `dev-startup.ps1` |
| Just refresh `.env.local` from existing ngrok | `dev-ngrok.ps1` |
| Kill all dev services | `etalo-stop.ps1` |

---

## etalo-dev-all.ps1 — One-command canonical launcher

Spawns 3 Windows Terminal tabs (Backend FastAPI + Frontend Next.js + ngrok tunnel). Pre-flight kills existing dev processes for clean restart, verifies INNER paths exist + ports 3000/8000 free, then launches the 3 services in parallel. Fallback to 3 separate `Start-Process` windows if Windows Terminal not installed.

### Run

From any directory :

```powershell
C:\Users\Oxfam\projects\etalo\Etalo\packages\web\scripts\etalo-dev-all.ps1
```

### What it spawns

- **Tab Etalo-Backend** : FastAPI on http://127.0.0.1:8000 (banner `✓ Running backend from CANONICAL inner repo (...) — Phase 4 hotfix #10 banner` expected at boot)
- **Tab Etalo-Frontend** : Next.js dev on http://localhost:3000 with `NEXT_PUBLIC_DEV_ROUTES=true` env (banner `=== Canonical inner repo (etalo/Etalo/packages/web) — Phase 4 hotfix #9 banner ===` expected via `predev` script)
- **Tab Etalo-ngrok** : tunnel on https://upright-henna-armless.ngrok-free.dev (reserved free-tier subdomain, persistent across sessions — MiniPay Developer Mode app does not need re-config between runs)

### Setup global alias (recommended)

Edit your PowerShell profile (`$PROFILE`) and add :

```powershell
function etalo-up { & "C:\Users\Oxfam\projects\etalo\Etalo\packages\web\scripts\etalo-dev-all.ps1" $args }
function etalo-stop { & "C:\Users\Oxfam\projects\etalo\Etalo\packages\web\scripts\etalo-stop.ps1" $args }
```

Save, close, reload : `. $PROFILE`. Now `etalo-up` works from any directory.

### Stop

- `etalo-stop` (or run `.\etalo-stop.ps1` directly)
- OR close the Windows Terminal window
- OR Ctrl+C in each tab

---

## dev-startup.ps1 — Silent variant + auto .env.local

One-shot startup that runs the 3 services in **minimized** windows (no visible logs by default) + writes the ngrok URL into `packages/web/.env.local` automatically. Useful when you don't need to watch the logs and want the env config refreshed in one shot.

### Run

```powershell
C:\Users\Oxfam\projects\etalo\Etalo\packages\web\scripts\dev-startup.ps1
```

### What it does

1. Kills zombies on ports 3000 + 8000 + any ngrok agent
2. Starts backend (FastAPI) in minimized window
3. Starts frontend (Next.js) in minimized window
4. Waits for both to be reachable (60s timeout)
5. Starts ngrok tunnel (`ngrok http 127.0.0.1:3000`)
6. Captures HTTPS URL via ngrok local API (port 4040)
7. Writes `.env.local` with `NEXT_PUBLIC_BASE_URL` + `NEXT_PUBLIC_API_URL` + `LOCAL_API_REWRITE_TARGET`

### Stop

Close the 3 minimized windows, or :

```powershell
Get-Process ngrok,node,python | Stop-Process -Force   # nuke option
```

---

## dev-ngrok.ps1 — Standalone ngrok URL capture

Helper for when ngrok is **already running** in another terminal and you just need to refresh `packages/web/.env.local` with its current URL. Polls the ngrok local API (port 4040), captures the HTTPS public URL, writes it to `.env.local`.

```powershell
C:\Users\Oxfam\projects\etalo\Etalo\packages\web\scripts\dev-ngrok.ps1
```

---

## etalo-stop.ps1 — Kill all dev services

Compagnon to `etalo-dev-all.ps1`. Kills processes on ports 3000 + 8000 + ngrok agent.

```powershell
C:\Users\Oxfam\projects\etalo\Etalo\packages\web\scripts\etalo-stop.ps1
```

---

## Execution policy

If PowerShell blocks the scripts :

```powershell
# One-time per user (recommended)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or per-invocation
powershell -ExecutionPolicy Bypass -File <script-path>
```

## Then in MiniPay

Open `https://upright-henna-armless.ngrok-free.dev` in MiniPay Developer Mode. First visit shows the ngrok-free interstitial — click "Visit Site" once. Subsequent navigation works because the cookie is set in WebView. API fetches bypass the interstitial via the `ngrok-skip-browser-warning` header injected by `lib/fetch-api.ts`.
