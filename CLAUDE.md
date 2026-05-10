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

Active deploy (post-H-1 redeploy, 2026-05-05, ADR-042). Predecessor
addresses retained in `docs/DEPLOYMENTS_HISTORY.md` and
`packages/contracts/deployments/celo-sepolia-v2.json`
`previous_deployments[]`.

- MockUSDT (V2): 0xea07db5d3D7576864ac434133abFE0E815735300
- EtaloReputation: 0x539e0d44c0773504075E1B00f25A99ED70258178
- EtaloStake: 0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB
- EtaloVoting: 0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A
- EtaloDispute: 0xEe8339b29F54bd29d68E061c4212c8b202760F5b
- EtaloEscrow: 0xAeC58270973A973e3FF4913602Db1b5c98894640
- EtaloCredits (J7): 0x778a6bda524F4D396F9566c0dF131F76b0E15CA3
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
- Credits (ADR-014 + ADR-049 V1 pivot): 0.15 USDT/credit, **1 credit =
  1 product photo enhancement**, **welcome 3 credits**, **no monthly
  free**, no subscription (see `docs/PRICING_MODEL_CREDITS.md` v2.0).
  The 5-template marketing pack is deferred V1.5+ — code stays in repo
  but UI hidden behind `NEXT_PUBLIC_ENABLE_MARKETING_TAB=false`.

## Developer

Solo developer: Mike, based in Belgium, Cameroonian roots.
Language preference: French for conversation, English for code and docs.

## Current sprint

**Sprint J11.7 — Geographic Location + Delivery Address ✓ MERGED
2026-05-06** (PR #23 `feat/geo-and-delivery-address` + PR #24 hotfix
`fix/address-book-upsert-user`). Plan détaillé dans
`docs/SPRINT_J11_7.md`. Closure dans
`docs/audit/SPRINT_J11_7_CLOSURE.md`.

Tracking ADRs : **ADR-044** (delivery address) + **ADR-045** (geo
filters / intra-Africa enforcement).

Livré (10 blocks + hotfix) :

- Block 1 — DB : `seller_profile.country` + `buyer_profile.country`,
  table `delivery_addresses` (buyer address book), and
  `orders.delivery_address_snapshot` (immutable JSON copy at
  fund time). Migration additive, downgrade clean.
- Block 2 — API address book CRUD (`POST/GET/PUT/DELETE
  /api/v1/me/addresses`).
- Block 3 — Marketplace country filter
  (`GET /marketplace/products?country=`) + cross-border block au
  cart-token (422 `cross_border_not_supported`).
- Block 4 — Seller country edit via `CountrySelector` dans
  `ProfileTab`.
- Block 5 — Buyer country detection + prompt banner (fallback
  manuel ; auto-detect MiniPay phone country reporté V1.5+).
- Block 6 — Address book UI à `/profile/addresses` (new route,
  145 kB First Load).
- Block 7 — Checkout structured address picker + snapshot
  persistence (`PATCH /orders/by-onchain-id/{id}/delivery-address`).
- Block 8 — `OrderDeliveryAddressCard` côté acheteur dans
  `/orders/[id]` (full address post-fund + WhatsApp deeplink).
- Block 9 — Marketplace country filter chips + URL state +
  prompt banner wiring.
- Block 10 — Tests + bundle delta + closure doc.
- Hotfix #24 — upsert User row on first address save (404 → 201).
- Hotfix #25 — surface delivery_address_snapshot inline sur
  cartes vendeur dashboard (mergé 2026-05-07).

Métriques closure :

- Tests : **478 web vitest PASS** (+59 net, 419 → 478) /
  **175 backend pytest PASS** (+24 net, 151 → 175). 6 preexisting
  fails inchangés (marketing e2e + RPC fallback).
- Bundle : `/profile/addresses` new 145 kB / `/checkout`
  222 → 250 kB / `/marketplace` 143 → 150 kB / `/orders/[id]`
  221 → 222 kB / `/seller/dashboard` 264 → 267 kB. Toutes
  routes sous leur cap strict.
- 0 contract changes — pure schema + API + frontend.

Reportés à manuel post-merge :

- Lighthouse mobile run sur `/profile/addresses`, `/checkout`,
  `/marketplace` (audit auto flaky sur Windows shell ; commande
  manuelle dans closure doc).
- WhatsApp deeplink device test (réel MiniPay).
- `pnpm gen:api` regen post-restart backend (les types locaux
  dans `seller-api.ts` deviennent redundant intersections, sans
  régression).
- Smoke E2E re-run bloqué par FU-J11-008 BigInteger bug
  (re-tenté quand MiniPay team répond OU validation J12 mainnet).

V1.5+ déférés : popularity sort, MiniPay phone auto-detection,
comprehensive seller onboarding.

**Sprint en cours (2026-05-10) : J12-pre — pivot asset generator
(ADR-049)**

Pivot stratégique du marketing image generator avant J12 mainnet :
on enterre les 5 templates marketing (IG square / IG story / WA
status / TikTok / FB feed) pour V1 et on transforme la feature en
**photo enhancement intégré au flow add-product**. Justification
complète dans ADR-049 (time-to-value, scope creep, UX friction).

Livrables V1 pivot :
- Backend : nouvel endpoint `POST /api/v1/products/{id}/enhance-photo`
  (atomique : check credits → birefnet bg-removal → composite white
  square 2048×2048 → pin IPFS → consume 1 credit → update product →
  return). Idempotent sur (product_id, source_hash).
- Backend : `WELCOME_BONUS_CREDITS = 3` (au lieu de 10),
  `MONTHLY_FREE_CREDITS = 0`, `ensure_monthly_free_granted` no-op.
- Frontend : `AddProductForm` — bouton "Enhance photo · 1 credit"
  après upload photo, click → loading → preview enhanced → save
  product avec photo enhanced.
- Frontend : `MarketingTab` cachée derrière feature flag
  `NEXT_PUBLIC_ENABLE_MARKETING_TAB=false` (default V1).
- Migration : `Product.enhanced_at: DateTime | null` (additive,
  downgrade safe).
- Docs : ADR-049 + PRICING_MODEL_CREDITS v2.0 + ce fichier.

Code dormant V1.5+ (committé mais non exposé en V1) :
- 5 templates HTML (asset_templates/*.html)
- caption_generator avec CTAs platform-aware
- short_links system + `/r/{code}` endpoint
- MarketingTab UI complète

**Sprint enchaîné (2026-05-10) : J12-pre — pivot inline delivery
checkout (ADR-050, supersedes ADR-044)**

L'address-book pattern J11.7 (carnet d'adresses à `/profile/addresses`)
introduit trop de friction pour des acheteurs occasionnels africains
(3 context-switches avant paiement). De plus, `recipient_name` manquait
au modèle `delivery_addresses` — les couriers africains refusent les
colis sans nom destinataire.

Pivot V1 : **form de delivery address inline au checkout**, snapshot
direct dans `Order.delivery_address_snapshot` JSONB, pas de
`delivery_addresses` row créée. Adapté contexte africain : recipient_name
+ area (neighborhood/estate) en plus des fields J11.7, labels région
dynamiques par pays (State NGA / County KEN / Region GHA).

Livrables V1 pivot inline checkout :
- Backend : `PATCH /api/v1/orders/by-onchain-id/{id}/delivery-address-inline`
  acceptant le snapshot complet en body (vs `address_id` reference de
  J11.7). Validation : recipient_name + area required, country in
  {NGA, GHA, KEN}.
- Frontend : `InlineDeliveryAddressForm.tsx` (nouveau), refactor de
  `CheckoutDeliveryAddressStep.tsx` (remplace AddressSelectorList +
  AddressFormModal), `OrderDeliveryAddressCard.tsx` mise à jour pour
  render recipient_name + area + null-safe sur snapshots legacy.
- Frontend : `/profile/addresses` cachée derrière feature flag
  `NEXT_PUBLIC_ENABLE_ADDRESS_BOOK=false` (default V1).
- sessionStorage pre-fill du last-used inline (pas de backend storage).
- Pas de migration DB — JSONB accepte les nouvelles clés.

Code dormant V1.5+ :
- AddressBookPage + AddressFormModal + AddressSelectorList
- `delivery_addresses` table (rows existantes preserved, no new rows)
- `/api/v1/me/addresses` CRUD endpoints

Sprint précédent (mergé) : `feat/seller-orders-pick-list-deadline`
— refonte UX du dashboard vendeur orders au-dessus de PR #25.
Scope, post J11.7 follow-up (commit 2026-05-07) :

- Backend : `SellerOrderItem.line_items[]` (per-SKU breakdown
  agrégé depuis `Order.product_ids` join `products`, qty = count
  d'occurrences). Field nommé `line_items` (pas `items`) pour
  éviter le clash Pydantic `from_attributes` avec la relation
  SQLAlchemy `Order.items` lazy-loaded (MissingGreenlet sinon).
- Frontend `lib/sellerOrderHelpers.ts` (nouveau) — `buyerLabel`
  (anonymise vs rule #5), `deadlineInfo` (ADR-019 7-day
  seller-inactivity window), `statusBadgeClass`,
  `aggregateOpenOrdersBySku`, `summarizeOrders`.
- `OrdersTab` réécrit : bandeau agrégé sticky, toggle Orders ↔
  Pick list, buyer label anonymisé (jamais 0x…), countdown
  deadline color-coded, line_items inline avec thumbnails IPFS,
  Mark shipped promu en primary CTA.
- `PickListView` (nouveau) — Vue B item-centric, roll-up par
  SKU, tri par deadline la plus proche puis qty desc.
- `OrderDeliveryAddressCard` — drop `phone_number` brut (privacy,
  anti-bypass escrow), prop `hideWhenEmpty` pour orders pre-fund.

Métriques : 511 web vitest PASS (+33 net), 17/17 backend PASS sur
`test_seller_crud_e2e.py` (+1 test agrégation). TSC + ESLint
clean.

Différés sprint J11.8 dédié : filter chips, MarkBatchShippedDialog,
pagination infinite, polling, search, stock decrement, velocity
ProductsTab. V1.5+ : print/share pick list, offline-first, swipe
gestures.

**Sprint suivant : J12 mainnet deploy + listing submission** avec
baseline V1.2 (`v1.2-geo-and-delivery` tag pending).

Sprint précédent J10-V5 (Design System V5 Robinhood-target) —
Phases 1-4 closes 2026-05-02, Phase 5 Block 1 + 2 closes
2026-05-03 et 2026-05-04. Plan complet dans
`docs/SPRINT_J10_V5.md`, lessons cumulatives dans
`docs/PHASE_4_LESSONS_LEARNED.md`. Phase 5 Block 3+
(Robinhood QA pass, demo video, grants Celo Foundation,
tag `v2.0.0-design-system-v5-sepolia`) reprend post-J12.

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

- **ADR-049 (asset gen pivot — 5-template marketing pack → product
  photo enhancement in add-product flow, welcome 3, monthly 0)** —
  drives the Economics line + Current sprint section.
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
