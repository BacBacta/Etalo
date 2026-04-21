# Etalo

**Non-custodial social commerce MiniPay Mini App for African sellers.**

> "Your digital stall, open 24/7"

Etalo lets informal sellers on Instagram, WhatsApp and TikTok create a real shop with secure USDT payments, buyer protection via on-chain escrow, and 3-level dispute resolution.

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.24, Hardhat v3, OpenZeppelin v5 |
| Mini App | React 18, Wagmi v3, Viem v2, shadcn/ui, Tailwind |
| Public Pages | Next.js 14 (App Router, SSR) |
| Backend | FastAPI, SQLAlchemy 2.0, PostgreSQL (Supabase), Redis (Upstash) |
| IPFS | Pinata |
| Admin | Next.js 14, NextAuth.js |
| Notifications | Twilio WhatsApp Business API |

## Monorepo Structure

```
etalo/
├── packages/
│   ├── contracts/       # Solidity smart contracts (Hardhat)
│   ├── miniapp/         # MiniPay Mini App (React)
│   ├── web/             # Public product pages (Next.js SSR)
│   ├── backend/         # FastAPI API server
│   └── admin/           # Admin dashboard (Next.js)
├── docs/
│   ├── ARCHITECTURE.md
│   └── SMART_CONTRACTS.md
├── docker-compose.yml   # Local dev (Postgres + Redis)
├── .env.example
└── SPRINT_J1.md
```

## Quick Start

### Prerequisites

- Node.js 20+, pnpm or npm
- Python 3.11+
- PostgreSQL 15+ (or Supabase account)
- Redis (or Upstash account)

### Smart Contracts

```bash
cd packages/contracts
npm install
cp .env.example .env  # fill in PRIVATE_KEY, CELOSCAN_API_KEY
npx hardhat test      # run 49 tests
```

### Backend

```bash
cd packages/backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env  # fill in DATABASE_URL, REDIS_URL, JWT_SECRET
alembic upgrade head  # apply migrations
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/api/docs

## Deployed Contracts (Celo Sepolia Testnet)

| Contract | Address |
|---|---|
| MockUSDT | `0x4212d248fc28c7aa0ae0e5982051b5e9d2a12dc6` |
| EtaloReputation | `0xc9d3f823a4c985bd126899573864dba4a6601ef4` |
| EtaloEscrow | `0x652e0278f4a1b7915dc89f53ab3e5c35696cb455` |
| EtaloDispute | `0x438ed447c5467abb6395b56a88bfec7a80c489e9` |

Explorer: https://celo-sepolia.blockscout.com

## Status

- [x] Smart contracts (Escrow, Dispute, Reputation)
- [x] 49 tests passing
- [x] Deployed + verified on Celo Sepolia
- [x] Backend API skeleton with health checks
- [x] Database schema (8 tables on Supabase)
- [x] IPFS service stub
- [ ] Mini App frontend
- [ ] Public product pages
- [ ] Admin dashboard
- [ ] WhatsApp notifications
