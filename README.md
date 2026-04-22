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
| Mini App        | Vite, React 19, Wagmi v2, Viem v2, shadcn/ui, Tailwind v3                    |
| Public Pages    | Next.js 14 (App Router, SSR), React 18, Tailwind v3                          |
| Backend         | FastAPI, SQLAlchemy 2.0, PostgreSQL (Supabase), Redis (Upstash), Alembic     |
| IPFS            | Pinata (dedicated gateway)                                                   |
| Admin           | Next.js 14 + NextAuth.js (scaffolded, not built yet)                         |
| Notifications   | Twilio WhatsApp Business API (row-level storage today, worker deferred)      |
| Charts          | Recharts 2.15                                                                |
| Forms           | react-hook-form + Zod                                                        |

CLAUDE.md originally specified React 18 + Wagmi v3; the actual baseline
is React 19 + Wagmi v2 (see `docs/DECISIONS.md`).

## Architecture

```
┌────────────────────────┐         ┌──────────────────────────┐
│  Buyer (browser)       │         │  Buyer (MiniPay WebView) │
│  → packages/web/       │  share  │  → packages/miniapp/     │
│  Next.js 14 SSR :3000  │────────▶│  Vite + React + Wagmi    │
│  /[handle]/[slug]      │ HTTPS   │  /checkout/:productId    │
└───────────┬────────────┘         └────────────┬─────────────┘
            │ GET public product               │ POST /orders/initiate
            │                                  │ POST /orders/confirm
            │                                  │
            ▼                                  ▼
      ┌───────────────────────────────────────────────────────┐
      │  packages/backend/  FastAPI :8000                     │
      │  /sellers  /uploads  /onboarding  /orders  /analytics │
      │  /notifications  /products/public                     │
      └──┬──────────┬─────────────────────────┬───────────────┘
         │          │                         │
         ▼          ▼                         ▼
      Supabase   Pinata IPFS             Celo Sepolia L2
      Postgres   (images + metadata)     EtaloEscrow + USDT
      (+ Alembic)                        (on-chain source of truth)
```

## Monorepo

```
etalo/
├── packages/
│   ├── contracts/       Solidity contracts + Hardhat + deploy/e2e scripts
│   ├── miniapp/         MiniPay Mini App (Vite + React)
│   ├── web/             Public product pages (Next.js 14 SSR)
│   ├── backend/         FastAPI API server
│   └── admin/           (empty — V1.5)
├── docs/
│   ├── SPRINT_J1.md     Day 1: foundation + contracts + backend
│   ├── SPRINT_J2.md     Day 2: miniapp + web + checkout flow
│   ├── DECISIONS.md     Architecture decision log
│   ├── FRONTEND.md      Frontend technical reference
│   ├── ARCHITECTURE.md
│   └── SMART_CONTRACTS.md
├── docker-compose.yml
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 20+, npm
- Python 3.11+
- PostgreSQL 15+ (or Supabase account)
- Redis (or Upstash account)
- MiniPay app on Android / iOS with testnet enabled (for device QA)
- ngrok (for exposing dev servers to the MiniPay WebView)

### Smart Contracts

```bash
cd packages/contracts
npm install
cp .env.example .env              # fill in PRIVATE_KEY, CELOSCAN_API_KEY
npx hardhat test                  # 49 tests
npx tsx scripts/e2e-checkout.ts   # on-chain flow smoke
```

### Backend

```bash
cd packages/backend
python -m venv venv
venv\Scripts\activate         # Windows (or: source venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env          # fill in DATABASE_URL, JWT_SECRET, PINATA_*
alembic upgrade head          # apply migrations
uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/api/docs
- Health:   http://localhost:8000/api/v1/health

Main route groups:
`/auth /sellers /uploads /onboarding /products /orders /analytics
/notifications /disputes /admin`

### Mini App (`packages/miniapp/`)

Vite + React 19 + Wagmi v2 + Viem v2 + shadcn/ui + Tailwind.

```bash
cd packages/miniapp
npm install
cp .env.example .env.local    # VITE_API_URL, contract addresses
npm run dev                   # serves on http://localhost:5173
```

Routes:

- `/` — landing (silent MiniPay auto-connect when loaded in-app)
- `/onboarding?step=1|2|3` — 3-step seller onboarding (draft saved to
  `localStorage` per wallet)
- `/seller` — dashboard with 6 cards (revenue, active orders, escrow,
  top products, reputation, notifications)
- `/checkout/:productId` — buyer flow (3-tx USDT payment)
- `/order/:orderId` — post-purchase recap with explorer link

### Public pages (`packages/web/`)

Next.js 14 App Router, SSR for SEO + social sharing.

```bash
cd packages/web
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_MINIAPP_URL
npm run dev                   # serves on http://localhost:3000
```

Routes:

- `/` — landing
- `/[handle]/[slug]` — SSR product page with OpenGraph / Twitter Card
  meta (1200x630 og:image from IPFS gateway)
- `not-found.tsx` — custom 404

## Deployed Contracts (Celo Sepolia Testnet)

| Contract        | Address                                      | Explorer                                                                                |
|-----------------|----------------------------------------------|-----------------------------------------------------------------------------------------|
| MockUSDT        | `0x4212d248fc28c7aa0ae0e5982051b5e9d2a12dc6` | https://celo-sepolia.blockscout.com/address/0x4212d248fc28c7aa0ae0e5982051b5e9d2a12dc6 |
| EtaloReputation | `0xc9d3f823a4c985bd126899573864dba4a6601ef4` | https://celo-sepolia.blockscout.com/address/0xc9d3f823a4c985bd126899573864dba4a6601ef4 |
| EtaloEscrow     | `0x652e0278f4a1b7915dc89f53ab3e5c35696cb455` | https://celo-sepolia.blockscout.com/address/0x652e0278f4a1b7915dc89f53ab3e5c35696cb455 |
| EtaloDispute    | `0x438ed447c5467abb6395b56a88bfec7a80c489e9` | https://celo-sepolia.blockscout.com/address/0x438ed447c5467abb6395b56a88bfec7a80c489e9 |

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

| Sprint | Date         | Focus                                                     | Status |
|--------|--------------|-----------------------------------------------------------|--------|
| J1     | 2026-04-21   | Foundation, smart contracts, backend skeleton             | Done   |
| J2     | 2026-04-22   | Mini App, public pages, checkout flow                     | Done (Block 8 device QA deferred) |

See `docs/SPRINT_J1.md` and `docs/SPRINT_J2.md` for per-sprint breakdowns.
`docs/DECISIONS.md` logs every non-trivial architectural choice with
rationale and replacement plan.
