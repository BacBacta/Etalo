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
hosting target (Render / Railway / Fly.io) is decided pre-J11 launch
— all three support this stack. Vercel Edge runtime is NOT compatible
(no Chromium binary in serverless edge).
