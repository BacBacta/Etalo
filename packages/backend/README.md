# Etalo backend

FastAPI + SQLAlchemy 2 (async) + PostgreSQL + Alembic + web3.py 7
indexer. Source of truth for the V2 architecture: `docs/BACKEND.md`.

## Quick start

```bash
cd packages/backend
python -m venv venv
./venv/Scripts/python.exe -m pip install -r requirements.txt
./venv/Scripts/playwright.exe install chromium    # see Playwright section below
cp .env.example .env                               # fill in secrets
./venv/Scripts/alembic.exe upgrade head
./venv/Scripts/python.exe scripts/run_dev.py
```

## Tests

```bash
./venv/Scripts/python.exe -m pytest                    # full suite
./venv/Scripts/python.exe -m pytest -m "not e2e"       # skip live-Sepolia E2E
./venv/Scripts/python.exe -m pytest tests/unit -v      # fast unit tests only
```

## Playwright dependency (Sprint J7)

The asset generator (`app/services/asset_generator.py`, ADR-037) uses
Playwright headless Chromium to render marketing images from HTML/CSS
templates.

**Local dev (Windows / macOS)**: `playwright install chromium` after
`pip install` downloads the platform-specific Chromium build (~150MB).
No system packages required.

**Production deploy (Linux)**: requires the Chromium runtime
dependencies. On Debian/Ubuntu base images:

```bash
apt-get install -y \
  libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2
playwright install --with-deps chromium
```

`playwright install --with-deps` will attempt to install the
distro-specific package set for you, but on minimal images (Alpine,
distroless) you may need to install them manually as above. The
hosting target is **Fly.io** (see Fly.io deploy section below) ;
Render / Railway also work but were not chosen. Vercel Edge runtime
is NOT compatible (no Chromium binary in serverless edge).

## Fly.io deploy

Single Machine architecture — uvicorn + V2 indexer in-process,
Postgres + Redis attached as managed services. Region `jnb`
(Johannesburg) for V1 markets latency (NG / GH / KE / ZA, ADR-041),
co-located with Vercel `cpt1` frontend. The indexer is the SOLE
writer to on-chain mirror tables (V2 invariant #14) so we run
exactly one Machine — no horizontal scaling.

### First-time setup

```bash
# 1. Install flyctl (already in this devcontainer once setup is done) :
curl -L https://fly.io/install.sh | sh

# 2. Auth (opens browser) :
fly auth login

# 3. Launch app from this directory :
cd packages/backend
fly launch --no-deploy --copy-config --name etalo-api --region jnb

# 4. Provision Postgres (Fly managed, single Machine for V1) :
fly postgres create --name etalo-db --region jnb \
  --vm-size shared-cpu-1x --volume-size 3 --initial-cluster-size 1
fly postgres attach --app etalo-api etalo-db
#   → Auto-injects DATABASE_URL secret on etalo-api.

# 5. Provision Redis (Upstash via Fly extension, free tier) :
fly redis create --name etalo-cache --region jnb --no-replicas
fly redis status etalo-cache
#   → Copy the redis:// URL :
fly secrets set --app etalo-api REDIS_URL='<paste-redis-url>'

# 6. Generate strong secrets and push them :
JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
CART_TOKEN_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
fly secrets set --app etalo-api \
  JWT_SECRET="$JWT_SECRET" \
  CART_TOKEN_SECRET="$CART_TOKEN_SECRET"

# 7. Push integration secrets (provide your real values) :
fly secrets set --app etalo-api \
  PINATA_JWT="<your-pinata-jwt>" \
  ANTHROPIC_API_KEY="<your-anthropic-key>" \
  TWILIO_ACCOUNT_SID="<sid-or-empty>" \
  TWILIO_AUTH_TOKEN="<token-or-empty>" \
  TWILIO_WHATSAPP_FROM="<whatsapp:+...-or-empty>"

# 8. First deploy (runs alembic upgrade head via release_command) :
fly deploy --app etalo-api

# 9. Smoke test :
curl https://etalo-api.fly.dev/api/v1/health
```

### Required secrets recap

| Secret | Source | Required |
|---|---|---|
| `DATABASE_URL` | `fly postgres attach` (auto) | ✓ |
| `REDIS_URL` | `fly redis create` (manual copy) | ✓ |
| `JWT_SECRET` | random 48 chars | ✓ |
| `CART_TOKEN_SECRET` | random 48 chars (≥ 32) | ✓ |
| `PINATA_JWT` | Pinata dashboard | ✓ for IPFS |
| `ANTHROPIC_API_KEY` | console.anthropic.com | optional (J7 caption gen) |
| `FAL_KEY` | fal.ai dashboard | ✓ for marketing images (ADR-047). Without it, asset_generator falls back to the legacy Playwright HTML composite. |
| `TWILIO_*` | twilio.com console | optional (J11.5 WhatsApp notifs) |

Non-secret config (region, contract addresses, CORS, indexer flags) is
hardcoded in [`fly.toml`](./fly.toml) `[env]`. To override temporarily
for a single deploy : `fly deploy -e KEY=VALUE`.

### After backend is live

Update the Vercel frontend env var to point at the Fly.io API :

```bash
cd packages/web
vercel env rm NEXT_PUBLIC_API_URL production
echo "https://etalo-api.fly.dev/api/v1" | vercel env add NEXT_PUBLIC_API_URL production
vercel --prod
```

### Operational commands

```bash
fly logs --app etalo-api          # tail logs (HTTP + indexer)
fly status --app etalo-api        # Machine + healthcheck status
fly ssh console --app etalo-api   # shell into the running Machine
fly machine list --app etalo-api  # confirm exactly 1 Machine running
```
