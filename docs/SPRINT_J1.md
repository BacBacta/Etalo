# Etalo — Sprint Day 1: Foundation & Smart Contracts

**Date**: Tuesday, April 22, 2026
**Duration target**: 12-14 hours
**Developer**: Mike (solo)
**AI assistant**: Cursor AI / Claude Code

---

## Day 1 Mission

Build the entire technical foundation of Etalo:
- Monorepo structure with Celo Composer MiniPay template
- PostgreSQL database schema with all core entities
- FastAPI backend skeleton with authentication
- Smart contracts for escrow + dispute + reputation
- Testnet deployment on Celo (Sepolia L2)
- CeloScan verification of all contracts

**End of day checkpoint**: Smart contracts deployed and verified on Celo testnet, backend API responding to health check, database migrations applied.

---

## Prerequisites Check (BLOCKER if not done)

Before writing any code, ensure:

- Node.js 20 or higher installed
- pnpm or npm installed
- Python 3.11 or higher installed
- PostgreSQL 15 or higher running locally (`docker compose up -d postgres` from repo root; prod uses Fly Postgres `etalo-db`)
- Docker Desktop installed and running
- Git configured
- Celo wallet with small amount of testnet CELO (from https://faucet.celo.org)
- Android or iOS device with MiniPay installed, testnet enabled
- ngrok account (free tier OK)
- Pinata IPFS account (free tier OK)
- Cursor or VS Code with AI agent available

**If any of these are missing, stop and set them up first.**

---

## Architecture Overview

Monorepo structure:
etalo/
├── packages/
│   ├── contracts/       Solidity smart contracts (Hardhat)
│   ├── miniapp/         MiniPay Mini App (React + Wagmi + Viem)
│   ├── web/             Public product pages (Next.js 14 SSR)
│   ├── backend/         FastAPI + PostgreSQL
│   └── admin/           Admin dashboard (Next.js 14)
├── docs/
│   ├── SPRINT_J1.md     This file
│   ├── ARCHITECTURE.md
│   └── API_SPEC.md
├── .env.example
├── docker-compose.yml   Local dev (Postgres + Redis)
└── README.md
Tech stack:
- Smart contracts: Solidity 0.8.24 + Hardhat + Hardhat Ignition + OpenZeppelin
- Mini App: React 18 + Wagmi v3 + Viem v2 + shadcn/ui + Tailwind
- Web: Next.js 14 (App Router) + SSR for product pages
- Backend: FastAPI + SQLAlchemy + Alembic + PostgreSQL + Redis
- IPFS: Pinata for product metadata
- Admin: Next.js 14 + NextAuth.js + JWT

---

## Time Breakdown

| Block | Task | Time | Priority |
|---|---|---|---|
| 1 | Project setup & monorepo init | 1h | Must-have |
| 2 | Smart contracts development | 4h | Must-have |
| 3 | Smart contracts testing | 1.5h | Must-have |
| 4 | Smart contracts deployment + CeloScan verify | 1h | Must-have |
| 5 | Backend FastAPI skeleton | 2h | Must-have |
| 6 | Database schema + migrations | 1.5h | Must-have |
| 7 | IPFS integration stub | 0.5h | Must-have |
| 8 | Environment configuration | 0.5h | Must-have |
| 9 | Documentation update | 0.5h | Must-have |
| Total | | 12.5h | |

---

## Block 1: Project Setup (1h)

Goal: Create the monorepo structure with Celo Composer MiniPay template.

Commands:
- `npx @celo/celo-composer@latest create -t minipay`
- Rename packages for clarity
- Initialize docker-compose.yml for local Postgres + Redis
- Create .env.example with all required variables

Checkpoint:
- Monorepo structure visible in file explorer
- docker-compose up starts Postgres and Redis locally
- .env.example has all required placeholders

---

## Block 2: Smart Contracts Development (4h)

Goal: Implement EtaloEscrow, EtaloDispute, EtaloReputation.

Files to create in packages/contracts/contracts/:
- interfaces/IERC20.sol
- interfaces/IEtaloEscrow.sol
- interfaces/IEtaloDispute.sol
- interfaces/IEtaloReputation.sol
- EtaloEscrow.sol (main escrow + milestones + force refund)
- EtaloDispute.sol (3-level dispute resolution)
- EtaloReputation.sol (Top Seller logic + sanctions)

Constants:
- USDT token Celo: 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e
- USDT adapter: 0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72
- Commission intra: 180 basis points (1.8%)
- Commission cross-border: 270 basis points (2.7%)
- Auto-release intra: 3 days
- Auto-release Top Seller: 2 days
- Auto-release cross-border: 7 days

Checkpoint:
- All contracts compile without errors
- OpenZeppelin imports resolved
- Events defined for all state changes

---

## Block 3: Smart Contracts Testing (1.5h)

Goal: Write comprehensive tests using Hardhat + Chai.

Test files in packages/contracts/test/:
- EtaloEscrow.test.ts (happy paths + edge cases)
- EtaloDispute.test.ts (L1/L2/L3 flows)
- EtaloReputation.test.ts (Top Seller, sanctions)
- helpers/MockUSDT.sol (mock with 6 decimals)
- helpers/fixtures.ts (shared test fixtures)

Must cover:
- Intra-country order full lifecycle
- Cross-border 4 milestones release
- Auto-release after deadline
- USDT 6-decimals math correctness
- Dispute L1 -> L2 -> L3 escalation
- Force refund by admin
- Top Seller gets 2-day auto-release
- Reputation sanctions for disputes lost

Checkpoint:
- All tests pass with `npx hardhat test`
- Coverage >= 85% on main contracts

---

## Block 4: Deploy to Celo Testnet + Verify (1h)

Goal: Deploy contracts to Celo Sepolia L2 testnet and verify on block explorer.

Prerequisites:
- Wallet with testnet CELO (from https://faucet.celo.org)
- CeloScan API key (from https://celoscan.io/myapikey)
- PRIVATE_KEY and CELOSCAN_API_KEY set in packages/contracts/.env

Steps:
1. Verify current testnet info (Sepolia L2 since March 2025 migration)
2. Update hardhat.config.ts with network configs
3. Create deployment module using Hardhat Ignition
4. Deploy in order: Reputation -> Dispute -> Escrow
5. Verify each contract on CeloScan/Blockscout
6. Save addresses to deployments/sepolia.json

Checkpoint:
- 3 contracts deployed to Celo testnet
- All 3 verified on block explorer
- Deployment addresses committed to git

---

## Block 5: Backend FastAPI Skeleton (2h)

Goal: Create FastAPI backend with basic structure, health check, auth stub.

Structure in packages/backend/:
- app/main.py (FastAPI entry)
- app/config.py (pydantic-settings)
- app/database.py (SQLAlchemy engine + session)
- app/security.py (JWT + password hashing)
- app/models/ (SQLAlchemy models)
- app/schemas/ (Pydantic API models)
- app/routers/ (health, auth, users, products, orders, disputes, analytics, admin)
- app/services/ (ipfs, whatsapp, celo, analytics)

Key requirements:
- Python 3.11+, FastAPI 0.115, SQLAlchemy 2.0
- CORS configured for dev + prod
- Health check endpoints: /health, /health/db, /health/redis
- OpenAPI docs at /api/docs (disabled in prod)
- Auth stub: /api/v1/auth/nonce, /api/v1/auth/verify

Checkpoint:
- Backend runs on localhost:8000
- /api/v1/health returns 200
- OpenAPI docs accessible at /api/docs

---

## Block 6: Database Schema + Migrations (1.5h)

Goal: Create SQLAlchemy models and Alembic migrations.

Entities:
- User (wallet, phone, email, flags, country, language)
- SellerProfile (shop handle, name, description, logos, socials)
- Product (title, description, price_usdt, stock, IPFS hashes, status)
- Order (on-chain ID link, buyer/seller, amount, status, delivery)
- DisputeMetadata (level, issue type, photos, conversation, resolution)
- Notification (channel, type, template, payload, timestamps)
- AuditLog (admin actions with IP and timestamp)
- AnalyticsSnapshot (denormalized daily stats per seller)

Technical requirements:
- UUID primary keys (PostgreSQL native)
- SQLAlchemy 2.0 typed syntax (mapped_column)
- Decimal(20, 6) for USDT amounts
- Checksummed wallet addresses (EIP-55)
- JSONB for flexible fields (conversation)
- PostgreSQL ARRAY for image IPFS hashes
- Indexes on: wallet_address, shop_handle, order.status, product.status, notification.user_id

Checkpoint:
- All SQLAlchemy models created
- Alembic migration generated and applied
- DB tables verified with `\dt`

---

## Block 7: IPFS Integration Stub (30min)

Goal: Create Pinata wrapper for uploading product metadata and images.

File: packages/backend/app/services/ipfs.py

Methods:
- upload_json(data) -> ipfs_hash
- upload_image(file_bytes, filename) -> ipfs_hash
- get_url(ipfs_hash) -> gateway URL
- pin_by_hash(ipfs_hash) -> bool

Requirements:
- Use httpx.AsyncClient (async)
- Retry logic (3 attempts, exponential backoff)
- Don't log API responses (leak risk)
- 30s timeout for uploads

Checkpoint:
- IPFSService class created
- Tests pass with mocked responses
- Manual test: upload JSON, verify gateway access

---

## Block 8: Environment Configuration (30min)

Goal: Consolidate all environment variables, document setup.

Files to update:
- Root .env.example (all variables)
- packages/contracts/.env.example (contract vars only)
- packages/backend/.env.example (backend vars only)
- packages/miniapp/.env.example (frontend vars only)
- docs/SETUP.md (step-by-step setup instructions)
- Root package.json scripts (dev, build, test, deploy, db:migrate)

Checkpoint:
- All .env.example files complete and coherent
- docs/SETUP.md comprehensive
- Root scripts work

---

## Block 9: Documentation Update (30min)

Goal: Update README.md and create ARCHITECTURE.md.

Files:
- README.md (project description, tech stack, monorepo structure, quick start, status)
- docs/ARCHITECTURE.md (component responsibilities, data flows, security model)
- docs/SMART_CONTRACTS.md (deployed addresses, public functions, events)

Final git commit: "feat: day 1 foundation complete - contracts, backend skeleton, db schema"

Checkpoint:
- All docs updated
- Final commit pushed to GitHub

---

## End of Day 1 Final Checklist

- Smart contracts deployed to Celo testnet (3 contracts)
- All contracts verified on CeloScan/Blockscout
- Backend API running on localhost:8000 with /health returning 200
- Database migrations applied, tables visible
- IPFS service tested (upload test file, verify gateway access)
- Environment files documented and populated
- README, ARCHITECTURE, SMART_CONTRACTS docs written
- Everything committed to git and pushed to GitHub
- Links to verified contracts ready to share

---

## Fallback Plan if Behind Schedule

If by hour 10 significantly behind, prioritize in this order:

MUST have (non-negotiable for J2):
1. Smart contracts deployed + verified on testnet (Blocks 1-4)
2. Database migrations applied (Block 6 partial)
3. Backend /health endpoint working (Block 5 minimal)

CAN defer to J2 morning:
- IPFS service full implementation (use mock for now)
- Documentation (bare minimum, polish later)
- Alembic full schema (start with User + Product + Order)

MUST NOT skip:
- Contract tests (skipping = production bugs in escrow)
- CeloScan verification (required for MiniPay submission)

---

## Notes & Decisions Log

Track decisions and deviations here as you work:

- Decision 1:
- Decision 2:
- Unexpected issue 1: