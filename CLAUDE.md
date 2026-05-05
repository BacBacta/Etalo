# Etalo — Project Context for AI Agents

## What we're building

Etalo is a non-custodial social commerce Mini App for African sellers,
built on Celo and distributed via MiniPay.

Target markets: Nigeria, Ghana, Kenya, South Africa primary (4 markets V1
big bang launch, see ADR-041), diaspora secondary.
Target user: informal sellers on Instagram/WhatsApp/TikTok who want a real
24/7 shop with secure USDT payments and buyer protection.

V1 scope is **intra-Africa only** — cross-border transactions are deferred
V2 (see ADR-041). The 4 launch markets transact among themselves; diaspora
buying is a public-funnel-only signal in V1.

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
- Frontend (single Next.js app at `etalo.app`, see ADR-035): React 18.3 +
  TypeScript 5 + Next.js 14 (App Router, SSR + Client Components) +
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
3. NEVER use EIP-1559 transactions — MiniPay only accepts legacy and CIP-64 (type 0x7b). Note : legacy uniquement V1 ; câblage CIP-64 USDT feeCurrency = V1.5 (voir ADR-003). Plan de remplacement = `asLegacyTx()` peut émettre type 0x7b avec `feeCurrency=USDT_ADAPTER` quand activé.
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
10. V1 is intra-Africa only (ADR-041) — no `isCrossBorder` flag, no
    seller stake, no destination-country selection. Cross-border
    surfaces (ADR-018 / ADR-019 cross clause / ADR-020 / ADR-021)
    are deferred V2.
11. Architectural limits are hardcoded (ADR-026) — never propose code
    that bypasses: `MAX_ORDER = 500 USDT`, `MAX_TVL = 50_000 USDT`,
    `MAX_SELLER_WEEKLY = 5_000 USDT`, `EMERGENCY_PAUSE_MAX = 7 days`.
    Numerical values may be revisited at V1 mainnet deploy time given
    4-market big-bang load patterns (per ADR-041).
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

## Key addresses (Celo Sepolia testnet — V2 deploys)

- MockUSDT (V2): 0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3
- EtaloReputation: 0x2a6639074d0897c6280f55b252B97dd1c39820b7
- EtaloStake: 0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417
- EtaloVoting: 0x335Ac0998667F76FE265BC28e6989dc535A901E7
- EtaloDispute: 0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE
- EtaloEscrow: 0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb
- EtaloCredits (J7): 0xb201a5F0D471261383F8aFbF07a9dc6584C7B60d
- creditsTreasury (ADR-024): 0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA
- commissionTreasury (ADR-024): 0x9819c9E1b4F634784fd9A286240ecACd297823fa
- communityFund (ADR-024): 0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6

## Economics (locked, see ADRs for rationale)

- Commission V1: **1.8% single rate** (ADR-041) — Top Seller 1.2%
  program deferred V1.1 with volume / ratings / dispute criteria.
- Auto-release intra: **3 days standard** (ADR-041) — single timer V1.
- Seller inactivity deadline (ADR-019 intra clause): 7 days intra →
  permissionless auto-refund.
- Cross-border release flow, 14-day cross-border deadline, and seller
  stake (ADR-018 / ADR-019 cross clause / ADR-020 / ADR-021) →
  **DEFERRED V2** by ADR-041.
- Credits (ADR-014): 0.15 USDT/credit, 5 free/month, 10 welcome bonus,
  no subscription (see `docs/PRICING_MODEL_CREDITS.md`).

## Developer

Solo developer: Mike, based in Belgium, Cameroonian roots.
Language preference: French for conversation, English for code and docs.

## Current sprint

Sprint J10-V5 — Design System V5 Robinhood-target. Plan détaillé
dans `docs/SPRINT_J10_V5.md`. Branche `feat/design-system-v5`.

Phase closures :

- Phase 1 (Foundations) ✓ 16 commits
- Phase 2 (Motion) ✓ 11 commits
- Phase 3 (Visuals) ✓ 9 commits — bundle 262 KB strict, 4
  composants V5 livrés, 8 lessons #73-#80
- **Phase 4 (Layout refactor + V5 applications migration) ✓ done
  2026-05-02** — 6 Blocks (1-4 + 5 + 6) + 10 hotfixes (incl. #9
  dual-repo frontend + #10 dual-repo backend footgun
  neutralization). 243 PASS frontend (+65 net Phase 4) / 120
  PASS backend (+5). `/seller/dashboard` 22.9 kB route /
  **263 kB First Load** (17 kB headroom préservé sous trigger
  280 kB strict, −17 kB net Phase 4). Live MiniPay validation
  confirmed end-to-end sur INNER frontend + INNER backend.
  Cumulative pattern catalogue dans
  `docs/PHASE_4_LESSONS_LEARNED.md`.

**Phase 5 (Polish + Submission) IN PROGRESS depuis 2026-05-03**.

Block 1 (Tabular nums systematic application + bonus dates
locale-pin sweep) ✓ done 2026-05-03 — 6 sub-blocks, 6 commits,
~25 sites touched across dashboard + cart + checkout + boutique +
marketplace, new `lib/format.ts` (formatChartDate + formatRowDate
both pinned en-US UTC), 243 PASS conserved, /seller/dashboard
22.9 → 23.2 kB route / 263 kB First Load (0 net), 17 kB headroom
preserved. Closure section in `docs/SPRINT_J10_V5.md` Phase 5
Block 1.

**Block 2 (Mobile gestures critiques) ✓ done 2026-05-04** —
5 sub-blocks, 5 commits. Cart drawer swipe-to-close
(SheetV4 migration + nested LazyMotion features={domMax} +
m.div drag="x" + threshold helper `shouldCloseOnSwipe` 100 px
OR 500 px/s) + marketplace pull-to-refresh (custom pointer
handlers + CSS transitions, motion drag overkill avoided ;
gating sur `window.scrollY === 0` ; threshold 80 px ;
overscroll-contain blocks native Android Chrome PTR conflict)
+ marketplace data path refactored to `useInfiniteQuery`
(5e consumer TanStack Query) + visible Refresh button
mandatory a11y. 247 → 266 PASS (+19), /seller/dashboard
23.2 → 23.3 kB route / 263 → 264 kB First Load,
/marketplace 8.23 → 9.27 kB route / 132 → 142 kB First Load
(TanStack pagination infra acceptable trade-off), 16 kB
headroom préservé. Closure section in
`docs/SPRINT_J10_V5.md` Phase 5 Block 2.

Phase 5 Blocks restants : side-by-side Robinhood QA pass,
polish details, demo video 3 min, Karma GAP profile + Farcaster
post + repo README polish, grants Celo Foundation submission, tag
final `v2.0.0-design-system-v5-sepolia`. Liste complete + plan
Block 3-9 dans `docs/SPRINT_J10_V5.md`.

When user says "start Phase 5 Block N" or "continue Block X", read
that block in `docs/SPRINT_J10_V5.md` and execute.

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

Most-load-bearing recent ADRs for V1 scope:

- ADR-041 (V1 scope restriction — intra-only, 4-market big bang,
  single 1.8% rate, stake retired) — drives this file's Economics +
  Critical rules + Target markets sections.
- ADR-040 (V5 design pivot) — drives Current sprint section.
- ADR-035 (single Next.js app at etalo.app) — drives Architecture.
- ADR-034 (no new EIP-191 backend auth) — Critical rules #14.

## Design standards (from MiniPay official docs)

- Mobile-first: minimum viewport 360x720 pixels (satisfait MiniPay submission §2 qui exige 360×640 minimum)
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
