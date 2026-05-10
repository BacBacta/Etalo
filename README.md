# Etalo

**Non-custodial social commerce MiniPay Mini App for African sellers.**

> "Your digital stall, open 24/7"

Etalo lets informal sellers on Instagram, WhatsApp and TikTok create a
real shop with secure USDT payments, buyer protection via on-chain
escrow, and 3-level dispute resolution.

## Tech Stack

| Layer           | Technology                                                                   |
|-----------------|------------------------------------------------------------------------------|
| Smart Contracts | Solidity 0.8.24, Hardhat v3, OpenZeppelin v5                                 |
| Web (single app)| Next.js 14 (App Router, SSR + Client), React 18.3, Wagmi v2, Viem v2, shadcn/ui, Tailwind v3, motion 12, recharts 3 |
| Backend         | FastAPI, SQLAlchemy 2.x async, PostgreSQL (psycopg 3), Alembic, web3.py 7.x AsyncWeb3 (V2 indexer) |
| IPFS            | Pinata (dedicated gateway)                                                   |
| Admin           | Next.js 14 + NextAuth.js (scaffolded V1.5)                                   |
| Notifications   | Twilio WhatsApp Business API (row-level storage today, worker deferred)      |

Per ADR-035 the predecessor `packages/miniapp/` (Vite) is deprecated — a single Next.js app at `etalo.app` serves both the public funnel surface (no wallet required, SEO-optimized) and the MiniPay surface (detection via `window.ethereum?.isMiniPay`). See `docs/DECISIONS.md` ADR-035 for the unification rationale.

## Architecture (ADR-035 single-app)

```
┌────────────────────────────────────────────────────────────┐
│                  packages/web/  Next.js 14 :3000           │
│  Public funnel surface          MiniPay app surface        │
│  (no wallet, SSR, SEO)          (window.ethereum.isMiniPay)│
│  /[handle]/[slug]               /seller/dashboard          │
│  /                              /checkout                  │
│  /marketplace                   /onboarding                │
└───────────────────┬────────────────────────────────────────┘
                    │ /api/v1/* (proxied via Next rewrites in dev,
                    │            direct in prod)
                    ▼
        ┌───────────────────────────────────────────────────┐
        │  packages/backend/  FastAPI :8000                 │
        │  /sellers /products /orders /items /disputes      │
        │  /analytics /notifications /uploads               │
        └──┬──────────┬─────────────────────────┬───────────┘
           │          │                         │
           ▼          ▼                         ▼
        Postgres   Pinata IPFS             Celo Sepolia L2
        (Fly Postgres)  (images + metadata)    EtaloEscrow + Reputation
        + Alembic                          + Dispute + Credits
                                           (on-chain source of truth)
```

## Monorepo

```
etalo/
├── packages/
│   ├── contracts/       Solidity contracts + Hardhat + Foundry tests
│   ├── web/             Single Next.js 14 app (public + MiniPay surfaces, ADR-035)
│   └── backend/         FastAPI + SQLAlchemy + Alembic + web3.py indexer
├── docs/
│   ├── SPRINT_J*.md     Per-sprint plan + closures (J1..J10-V5)
│   ├── DECISIONS.md     ADR log (architectural decisions)
│   ├── FRONTEND.md      Frontend technical reference
│   ├── BACKEND.md       Backend technical reference
│   ├── SMART_CONTRACTS.md
│   ├── PRICING_MODEL_CREDITS.md
│   └── PHASE_4_LESSONS_LEARNED.md
├── .github/workflows/   CI (typecheck + lint + test on every push/PR)
├── CLAUDE.md            AI agent context + critical rules
├── LICENSE              MIT
├── docker-compose.yml
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 20+, pnpm (or npm)
- Python 3.13+
- PostgreSQL 15+ via `docker compose up -d postgres` (recommended) or local install (prod uses Fly Postgres, attached automatically — see `packages/backend/fly.toml`)
- ngrok (for exposing dev servers to the MiniPay WebView, reserved free-tier subdomain recommended)
- MiniPay app on Android with testnet enabled (for device QA)

### One-command dev environment (recommended)

```powershell
.\packages\web\scripts\etalo-dev-all.ps1
```

Spawns 3 Windows Terminal tabs (Backend FastAPI :8000 + Frontend Next.js :3000 + ngrok tunnel). Pre-flights port cleanup, fallback to 3 separate windows if Windows Terminal not available. See [`packages/web/scripts/README.md`](./packages/web/scripts/README.md) for the full launcher matrix + alias setup.

### Manual setup per package

#### Smart Contracts (`packages/contracts/`)

```bash
cd packages/contracts
pnpm install                                  # or npm ci
cp .env.example .env                          # PRIVATE_KEY, CELOSCAN_API_KEY
npx hardhat test                              # Hardhat unit tests
forge test --match-path 'test/**/*.t.sol'     # Foundry invariants
npx tsx scripts/e2e-checkout.ts               # on-chain flow smoke
```

See [`packages/contracts/README.md`](./packages/contracts/README.md) for the full contracts reference (Sepolia + Mainnet addresses, ADRs).

#### Backend (`packages/backend/`)

V2 FastAPI :8000 with async indexer polling Celo Sepolia every 30 s. See [`docs/BACKEND.md`](./docs/BACKEND.md).

```bash
cd packages/backend
python -m venv venv
.\venv\Scripts\Activate.ps1                   # Windows (or: source venv/bin/activate)
pip install -r requirements.txt
playwright install chromium                   # asset generator dependency, ADR-037
cp .env.example .env                          # DATABASE_URL, CELO_SEPOLIA_RPC, ...
alembic upgrade head
python scripts/sync_abis.py                   # vendor ABIs from packages/contracts
python scripts/run_dev.py                     # uvicorn wrapper + indexer auto-start
```

- API docs : `http://localhost:8000/docs`
- Health   : `http://localhost:8000/api/v1/health`

V2 route groups : `/orders /items /disputes /sellers /products /analytics /notifications /uploads`.

#### Web (`packages/web/`)

Single Next.js 14 app per ADR-035 (public funnel + MiniPay surfaces).

```bash
cd packages/web
pnpm install                                  # or npm ci
cp .env.example .env.local                    # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_BASE_URL
pnpm dev                                      # http://localhost:3000
pnpm test                                     # 295 PASS Vitest
pnpm lint                                     # next lint
pnpm build                                    # production bundle
```

See [`packages/web/README.md`](./packages/web/README.md) for routes overview + design system pointers.

## Deployed Contracts (Celo Sepolia Testnet — V2)

| Contract        | Address                                      |
|-----------------|----------------------------------------------|
| MockUSDT V2     | `0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3` |
| EtaloReputation | `0x2a6639074d0897c6280f55b252B97dd1c39820b7` |
| EtaloDispute    | `0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE` |
| EtaloEscrow     | `0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb` |
| EtaloCredits    | `0xb201a5F0D471261383F8aFbF07a9dc6584C7B60d` |
| EtaloStake      | `0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417` (V2 deferred per ADR-041) |
| EtaloVoting     | `0x335Ac0998667F76FE265BC28e6989dc535A901E7` (V2 deferred per ADR-041) |

Treasury wallets (3 separated per ADR-024) :

| Wallet | Address |
|---|---|
| creditsTreasury | `0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA` |
| commissionTreasury | `0x9819c9E1b4F634784fd9A286240ecACd297823fa` |
| communityFund | `0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6` |

Mainnet : `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` (USDT) + `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72` (adapter for gas fees). Etalo contracts mainnet TBD — Sprint J12 deploy.

## Testing the checkout flow

The end-to-end payment flow was validated on Celo Sepolia against a
freshly-minted test wallet. Proof of the full sequence is on-chain.

```bash
cd packages/contracts

# 1) Mint test USDT (1000 USDT to the deployer wallet)
MINT_RECIPIENT=0x66bD37325cf41dAd0035398854f209785C9bC4C2 \
MINT_AMOUNT_USDT=1000 \
npx tsx scripts/mint-test-usdt.ts

# 2) Run the 3-tx checkout flow against the live contracts
E2E_AMOUNT_USDT=5 E2E_IS_CROSS_BORDER=false \
npx tsx scripts/e2e-checkout.ts
```

Transaction hashes from the reference run:

| Step                 | Tx hash                                                              |
|----------------------|----------------------------------------------------------------------|
| `MockUSDT.mint`      | `0xc9787100ed6fc4b14ce030fa7f2666706878b667f6dd8574d80fa9bfb820c89b` |
| `USDT.approve`       | `0x5bb8772ad520a2de6eba8c48158ca8dadbbe021bb7efd4d1afc71610a9ca8278` |
| `Escrow.createOrder` | `0xd551efbc10c6c15f1b0761eeb73677ae4e4e94a7f24e3da4cd76221bda9af7aa` |
| `Escrow.fundOrder`   | `0x0deac8478de90ed274169981d0d319248a2d939130278321c9dd862de52d9cba` |

The resulting on-chain `Order` is in state `Funded`, with a 0.09 USDT
commission on a 5 USDT order (1.8 % — intra-Africa rate confirmed).

## Sprint status

| Sprint | Date | Focus | Status |
|--------|------|-------|--------|
| J1 | 2026-04-21 | Foundation, smart contracts, backend skeleton | Done |
| J2 | 2026-04-22 | Mini App, public pages, checkout flow | Done (Block 8 device QA deferred) |
| J4 | 2026-04-23/24 | V2 smart contract refactor, Sepolia deploy, audit prep | Done — tag `v2.0.0-contracts-sepolia` |
| J5 | 2026-04-24/25 | V2 backend — indexer, REST API, EIP-191 auth, E2E tests | Done — tag `v2.0.0-backend-sepolia` |
| J6 | 2026-04-26/28 | Boutique model V1 — handle URLs, grouped checkout, asset generator scaffold | Done |
| J7 | 2026-04-28/30 | Asset generator monetization (EtaloCredits + Pinata + Playwright per ADR-014, ADR-037) | Done |
| J8 | 2026-04-29 | Backend ADR-034 EIP-191 deprecation prep + on-chain events migration plan | Done |
| J9 | 2026-04-29/30 | V4 design system foundations (CardV4, ButtonV4, DialogV4, SheetV4, TabsV4) | Done |
| J10-V5 | 2026-04-30 → 2026-05-04 | V5 Robinhood-target design pivot (5 phases : Foundations → Motion → Visuals → Layout → Polish) | In progress (Phase 5 polish ~96% wall-clock, target tag `v2.0.0-design-system-v5-sepolia`) |
| J11 | TBD | Audit pratique freelance + AI per ADR-039 | Planned |
| J12 | TBD (Q2 2027) | Mainnet deploy + soft launch 10-20 sellers curated | Planned — tag `v2.0.0-mainnet-v1` |

See [`docs/SPRINT_J*.md`](./docs/) for per-sprint plans + closures, [`docs/DECISIONS.md`](./docs/DECISIONS.md) for the ADR log (ADR-001 → ADR-041 with rationale + replacement plan), [`docs/SMART_CONTRACTS.md`](./docs/SMART_CONTRACTS.md) and [`docs/BACKEND.md`](./docs/BACKEND.md) for technical references, and [`CLAUDE.md`](./CLAUDE.md) for AI agent context + critical rules.
