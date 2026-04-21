# Etalo — Project Context for AI Agents

## What we're building

Etalo is a non-custodial social commerce MiniPay Mini App for African sellers.
Target markets: Nigeria, Ghana, Kenya primary, diaspora secondary.
Target user: informal sellers on Instagram/WhatsApp/TikTok who want a real
24/7 shop with secure USDT payments and buyer protection.

Tagline: "Your digital stall, open 24/7"

## Tech stack (locked, do not change)

- Smart contracts: Solidity 0.8.24 + Hardhat + OpenZeppelin
- Mini App frontend: React 18 + Wagmi v3 + Viem v2 + shadcn/ui + Tailwind
- Public product pages: Next.js 14 (App Router, SSR)
- Backend: FastAPI + SQLAlchemy + PostgreSQL + Redis
- IPFS: Pinata for product metadata and photos
- Admin: Next.js 14 + NextAuth.js + JWT
- Notifications: Twilio WhatsApp Business API

## Critical rules (never break these)

1. NEVER commit .env files or private keys to git
2. USDT has 6 decimals — all amount math must handle this correctly
3. NEVER use EIP-1559 transactions — MiniPay only accepts legacy and CIP-64 (type 0x7b)
4. User-facing terminology required:
   - "network fee" (not "gas")
   - "deposit" / "withdraw" (not "on-ramp" / "off-ramp")
   - "stablecoin" or "digital dollar" (not "crypto" or "token")
5. NEVER display raw 0x... wallet addresses in UI — use shop handles or names
6. Every contract function moving funds must use ReentrancyGuard
7. Connection states: silence unless error (no "Connecting..." or "Connected" messages)
8. Transaction states: 4 precise states (Preparing / Confirming / Success / Error)
9. Commit frequently with clear Conventional Commit messages

## Key addresses (Celo mainnet)

- USDT token: 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e
- USDT adapter (for gas fees): 0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72

## Economics (locked)

- Commission intra-Africa: 1.8%
- Commission cross-border: 2.7%
- Auto-release intra: 3 days (2 days for Top Seller)
- Auto-release cross-border: 7 days

## Developer

Solo developer: Mike, based in Belgium, Cameroonian roots.
Language preference: French for conversation, English for code and docs.

## Current sprint

See SPRINT_J1.md for today's mission.
When user says "start Block N", read that block in SPRINT_J1.md and execute.
Always propose a plan before executing, and wait for validation.
Report what was done at the end of each block.

## Design standards (from MiniPay official docs)

- Mobile-first: minimum viewport 360x720 pixels
- Touch targets: minimum 44x44 pixels
- Body text: minimum 16 pixels (never smaller than 14)
- Single column layout, no horizontal scroll
- Safe areas: use env(safe-area-inset-*) for sticky bottom CTAs
- WCAG AA contrast minimum (4.5:1 body, 3:1 large)
- Dark mode: deferred to V1.5