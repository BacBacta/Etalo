# Etalo — Project Context for AI Agents

## What we're building

Etalo is a non-custodial social commerce Mini App for African sellers,
built on Celo and distributed via MiniPay.

Target markets: Nigeria, Ghana, Kenya primary, diaspora secondary.
Target user: informal sellers on Instagram/WhatsApp/TikTok who want a real
24/7 shop with secure USDT payments and buyer protection.

**V1 Boutique model** (see ADR-014): three integrated pillars:
1. Per-seller Boutique at `etalo.app/[handle]` — full catalog, cart,
   grouped checkout for N items from the same seller.
2. Dual-mode MiniPay app — buyer and seller modes in the same Mini App.
3. Asset generator (monetized) — per-product content pack sold in
   credits (0.15 USDT/credit, see `docs/PRICING_MODEL_CREDITS.md`).

**Architecture (ADR-035)**: All three pillars live in a single Next.js
app at `etalo.app`. The user's experience adapts based on MiniPay
detection: visitors without MiniPay see the public funnel surface
(per-seller boutique pages, conversion CTA); MiniPay users see the
full Mini App surface (marketplace, cart, seller dashboard).

Tagline: "Your digital stall, open 24/7"

Positioning: "non-custodial" per the Zenland / Circle standard
(ADR-022). Funds live in public smart contracts on Celo; mediator
power is structurally bounded by code.

## Tech stack (locked, do not change without an ADR)

- Smart contracts: Solidity 0.8.24 + Hardhat + OpenZeppelin
- Frontend (single Next.js app at `etalo.app`, see ADR-035): React 19 +
  TypeScript 6 + Next.js 14 (App Router, SSR + Client Components) +
  Wagmi v2 + Viem v2 + shadcn/ui + Tailwind. Same app serves the public
  funnel surface (no wallet required, SEO-optimized for social media
  inbound) and the Mini App surface (MiniPay detection via
  `window.ethereum?.isMiniPay`). See ADR-001, ADR-012, ADR-035.
- Backend: FastAPI + SQLAlchemy 2.x async + PostgreSQL (psycopg 3) +
  Alembic + web3.py 7.x AsyncWeb3 (V2 indexer; see `docs/BACKEND.md`)
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
7. Connection states: align with MiniPay best practices — show
    "Connecting to MiniPay..." while `isConnecting`, "Please open this app
    from MiniPay" if no provider detected, silent once connected. Never
    show a Connect button (auto-connect only). See MiniPay docs Best
    Practices > Wallet connection.
8. Transaction states: 4 precise states (Preparing / Confirming / Success / Error)
9. Commit frequently with clear Conventional Commit messages
10. Cross-border orders require seller stake (ADR-020) — `createOrder`
    must revert if the seller has not met the applicable tier's stake
11. Architectural limits are hardcoded (ADR-026) — never propose code
    that bypasses: `MAX_ORDER = 500 USDT`, `MAX_TVL = 50_000 USDT`,
    `MAX_SELLER_WEEKLY = 5_000 USDT`, `EMERGENCY_PAUSE_MAX = 7 days`
12. `forceRefund` is gated by THREE codified conditions (ADR-023) —
    dispute contract inactive + 90+ days order inactivity + registered
    legal hold. Never remove or relax these.
13. Treasury = 3 separated wallets (ADR-024) — `commissionTreasury`,
    `creditsTreasury`, `communityFund`. Never merge into one.
14. NEVER add new EIP-191 / signed-message authentication for backend
    mutations (ADR-034) — MiniPay best practices forbid signing for
    access. Existing auth points in `lib/eip191.ts` + `app/auth.py` are
    deprecated and flagged for migration to on-chain events before Proof
    of Ship submission. New mutating flows must be expressed as contract
    events captured by the J5 indexer.
15. Low-balance UX must redirect to MiniPay Add Cash deeplink (do not
    hardcode the URL — read from the deeplinks reference). Buyers without
    USDT must never reach a dead-end "transaction failed" screen — surface
    the Add Cash flow instead.

## Key addresses (Celo mainnet)

- USDT token: 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e
- USDT adapter (for gas fees): 0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72

## Economics (locked, see ADRs for rationale)

- Commission intra-Africa: 1.8%
- Commission cross-border: 2.7%
- Commission Top Seller (intra): 1.2%
- Auto-release intra: 3 days (2 days for Top Seller)
- Cross-border release (ADR-018): 20% on shipping proof / 70% at
  destination-country arrival + 72h without dispute / 10% at buyer
  confirmation or auto-release 5 days after majority release
- Seller inactivity deadlines (ADR-019): 7 days intra / 14 days
  cross-border → permissionless auto-refund
- Seller stake cross-border (ADR-020): Tier 1 Starter 10 USDT /
  Tier 2 Established 25 USDT / Tier 3 Top Seller 50 USDT
- Credits (ADR-014): 0.15 USDT/credit, 5 free/month, 10 welcome bonus,
  no subscription (see `docs/PRICING_MODEL_CREDITS.md`)

## Developer

Solo developer: Mike, based in Belgium, Cameroonian roots.
Language preference: French for conversation, English for code and docs.

## Current sprint

Sprint J6 — frontend boutique. Etalo is consolidating into a single
Next.js app at `etalo.app` (ADR-035, decided Block 5). Sprint J4
(smart contracts V2) and J5 (backend V2) are complete.

When user says "start Block N", read that block in the current sprint
file and execute.

Always propose a plan before executing, and wait for validation.
Report what was done at the end of each block.

## V2 invariants (locked alongside contract layout)

14. The V2 indexer is the SOLE writer to the on-chain mirror tables
    (orders, items, groups, disputes, stakes, reputation_cache). API
    handlers may only append to off-chain JSONB columns (delivery
    metadata, dispute photos, dispute conversation). Never write
    on-chain-derived state from a route handler.
15. EIP-191 auth uses the canonical message
    `Etalo auth: {METHOD} {PATH} {TIMESTAMP}` with a ±5min window.
    Never accept signatures over a custom shape; never extend the
    window without an ADR.

## Decision log

All architectural deviations from this file and all significant
technical decisions are tracked in `docs/DECISIONS.md` using the
ADR-XXX format. When deviating from this file or making a new
architectural decision, add an entry there before implementing. When
CLAUDE.md and DECISIONS.md disagree, DECISIONS.md wins until
CLAUDE.md is updated.

## Design standards (from MiniPay official docs)

- Mobile-first: minimum viewport 360x720 pixels
- Touch targets: minimum 44x44 pixels
- Body text: minimum 16 pixels (never smaller than 14)
- Single column layout, no horizontal scroll
- Safe areas: use env(safe-area-inset-*) for sticky bottom CTAs
- WCAG AA contrast minimum (4.5:1 body, 3:1 large)
- Dark mode: deferred to V1.5
- Error boundary mandatory at the app root (`<ErrorBoundary>` in
  `App.tsx` for miniapp, `error.tsx` in `app/` for web). All async
  failures must produce a user-friendly fallback, not a white screen.
- Body text: minimum 14px for secondary labels (badges, timestamps),
  16px for primary body content. `text-xs` (12px) is forbidden — replace
  with `text-sm` minimum (MiniPay design guidelines + CLAUDE.md rule).
