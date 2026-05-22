# V1.5+ Dormant Code — Index & Reactivation Guide

**Audience :** future Mike, future Claude, any engineer planning the post-V1 sprint.

**Why this doc :** four substantial feature families ship in the V1
repo but are NOT exposed to users — they were either built then
deferred (marketing pack, address book) or kept on-chain but UI-
retired (top seller tier, seller stake). Without an index it would be
easy to bit-rot them by accident during a refactor or to forget they
exist when scoping V1.5.

For each family : the files, the gate that hides them, the ADR that
made the call, and the precise steps to bring them back online.

---

## 1. Marketing pack (5-template asset generator + caption gen + short links)

**Deferred by :** [ADR-049](DECISIONS.md) — pivot from "5-template
shareable marketing pack" to "single in-form product photo
enhancement" because the marketing pack had bad time-to-value and
created scope creep before V1 launch.

**Feature-flag gate :**
- Frontend : `process.env.NEXT_PUBLIC_ENABLE_MARKETING_TAB === "true"`
  ([`SellerDashboardInner.tsx:64`](../packages/web/src/app/(app)/seller/dashboard/SellerDashboardInner.tsx#L64))
  → when `false`, the `Marketing` tab trigger + content don't render
  in the seller dashboard.
- Backend : routers + services stay registered but are unreachable
  from the UI ; no flag on the API itself (a curl request would still
  work — V1.5+ rewires the frontend, the backend stays warm).

**Files (frontend) :**
- [`components/seller/MarketingTab.tsx`](../packages/web/src/components/seller/MarketingTab.tsx) — top-level tab UI
- [`components/seller/marketing/TemplateSelector.tsx`](../packages/web/src/components/seller/marketing/TemplateSelector.tsx) — 5-template grid (IG square / IG story / WA status / TikTok / FB feed)
- [`components/seller/marketing/ProductPicker.tsx`](../packages/web/src/components/seller/marketing/ProductPicker.tsx)
- [`components/seller/marketing/CreditsBalance.tsx`](../packages/web/src/components/seller/marketing/CreditsBalance.tsx)
- [`components/seller/marketing/BuyCreditsDialog.tsx`](../packages/web/src/components/seller/marketing/BuyCreditsDialog.tsx) — Pinata pin-based payment flow
- [`components/seller/marketing/GeneratedAssets.tsx`](../packages/web/src/components/seller/marketing/GeneratedAssets.tsx)
- [`components/seller/marketing/ShareButtons.tsx`](../packages/web/src/components/seller/marketing/ShareButtons.tsx) — per-platform deeplinks
- [`lib/marketing-api.ts`](../packages/web/src/lib/marketing-api.ts) — frontend client
- Tests : `MarketingTab.test.tsx`, `BuyCreditsDialog.test.tsx`, `TemplateSelector.test.tsx`

**Files (backend) :**
- [`app/services/asset_generator.py`](../packages/backend/app/services/asset_generator.py) — `generate_assets()` + helpers. Photo-enhance helpers in the same file ARE V1 (live in add-product flow).
- [`app/services/asset_templates/`](../packages/backend/app/services/asset_templates/) — 5 HTML templates (fb_feed, ig_square, ig_story, tiktok, wa_status)
- [`app/services/caption_generator.py`](../packages/backend/app/services/caption_generator.py) — Claude-powered caption gen with platform-aware CTAs
- [`app/services/short_link_service.py`](../packages/backend/app/services/short_link_service.py) — `etalo.app/r/{code}` short-link minter
- [`app/routers/short_links.py`](../packages/backend/app/routers/short_links.py) — `GET /r/{code}` redirect endpoint (root-mounted, NO `/api/v1` prefix)
- [`app/routers/marketing.py`](../packages/backend/app/routers/marketing.py) — `/api/v1/marketing/*` endpoints
- [`app/models/short_link.py`](../packages/backend/app/models/short_link.py) — `short_links` table
- [`alembic/versions/e6f1a8b2c3d4_short_links_table.py`](../packages/backend/alembic/versions/e6f1a8b2c3d4_short_links_table.py)
- Scripts : `smoke_render_templates.py`, `sample_captions.py`
- Tests : `tests/e2e/test_marketing_caption_e2e.py`

**Reactivation steps (V1.5+) :**
1. Pricing review — `docs/PRICING_MODEL_CREDITS.md` was v2.0 for the V1 pivot (welcome 3, monthly 0, 1 credit = 1 enhance). The marketing pack assumed 5 credits / asset bundle. Decide tiers.
2. Set `NEXT_PUBLIC_ENABLE_MARKETING_TAB=true` on Vercel prod env. Redeploy.
3. Re-run `tests/e2e/test_marketing_caption_e2e.py` (pre-existing 6 fail unrelated per CLAUDE.md, but the marketing path should still smoke-test).
4. QA the 5 templates render correctly (Playwright `pnpm playwright` covers `smoke_render_templates.py` output).
5. Verify `etalo.xyz/r/{code}` short links resolve — Next.js rewrites `/r/*` → backend, this rewrite is still in `next.config.mjs` so it should be live.

**Estimated reactivation effort :** 2-3 days (mostly QA + caption tuning + pricing comms).

---

## 2. Address book (buyer-side delivery address management)

**Deferred by :** [ADR-050](DECISIONS.md) — pivot from "address book at
`/profile/addresses`" to "inline delivery form at checkout" because
the address-book pattern added too much friction for occasional
African buyers (3 context-switches before paying). ADR-050 also added
`recipient_name` + `area` to the snapshot shape (couriers refuse
packages without recipient name).

**Feature-flag gate :**
- Frontend : `process.env.NEXT_PUBLIC_ENABLE_ADDRESS_BOOK === "true"`
  ([`app/(app)/profile/addresses/page.tsx:21`](../packages/web/src/app/(app)/profile/addresses/page.tsx#L21))
  → when `false`, the route renders the 404 page instead of the
  address book UI.
- Backend : `/api/v1/me/addresses` CRUD endpoints stay registered but
  are unreferenced by the V1 frontend. Existing `delivery_addresses`
  rows are preserved ; ADR-050 says "no new rows created" by V1
  inline flow (snapshots write directly to `Order.delivery_address_snapshot`
  JSONB).

**Files (frontend) :**
- [`app/(app)/profile/addresses/page.tsx`](../packages/web/src/app/(app)/profile/addresses/page.tsx) — flag-gated route
- [`components/addresses/AddressBookPage.tsx`](../packages/web/src/components/addresses/AddressBookPage.tsx)
- [`components/addresses/AddressSelectorList.tsx`](../packages/web/src/components/addresses/AddressSelectorList.tsx)
- [`components/addresses/AddressFormModal.tsx`](../packages/web/src/components/addresses/AddressFormModal.tsx)
- [`components/addresses/AddressCard.tsx`](../packages/web/src/components/addresses/AddressCard.tsx)
- [`hooks/useAddresses.ts`](../packages/web/src/hooks/useAddresses.ts) — TanStack Query CRUD hooks

**Files (backend) :**
- [`app/routers/addresses.py`](../packages/backend/app/routers/addresses.py) — `/api/v1/me/addresses` POST/GET/PUT/DELETE
- [`app/models/delivery_address.py`](../packages/backend/app/models/delivery_address.py) — `delivery_addresses` table
- [`app/schemas/delivery_address.py`](../packages/backend/app/schemas/delivery_address.py)
- Migration : the table was added in the J11.7 Block 1 migration ; intact.

**What V1 uses today (NOT dormant — clarifying boundary) :**
- [`components/checkout/InlineDeliveryAddressForm.tsx`](../packages/web/src/components/checkout/InlineDeliveryAddressForm.tsx) — the V1 inline form
- [`components/checkout/CheckoutDeliveryAddressStep.tsx`](../packages/web/src/components/checkout/CheckoutDeliveryAddressStep.tsx) — checkout wiring
- [`components/orders/OrderDeliveryAddressCard.tsx`](../packages/web/src/components/orders/OrderDeliveryAddressCard.tsx) — read-only snapshot view (seller + buyer)
- `Order.delivery_address_snapshot` JSONB column — V1 write target

**Reactivation steps (V1.5+) :**
1. Decision : keep inline-only (cheaper UX), or re-add the address book as a "saved addresses" power-user feature ?
2. If yes : set `NEXT_PUBLIC_ENABLE_ADDRESS_BOOK=true` on Vercel.
3. Add a CTA in the inline form ("Save this address to my book") that POSTs to `/api/v1/me/addresses` and pre-fills next time via the existing `useAddresses` hook.
4. Verify `recipient_name` + `area` are saved on the `delivery_addresses` row, not just the snapshot (the schema accepts both per ADR-050).

**Estimated reactivation effort :** 1 day (the code paths still exist ; only the wiring changes).

---

## 3. Top Seller commission tier (1.2 % reduced rate)

**Deferred by :** [ADR-041](DECISIONS.md) — V1 scope restriction.
Original ADR-020 envisioned a 1.2 % commission rate (vs 1.8 % default)
for sellers that hit `TOP_SELLER_MIN_ORDERS = 50` + `TOP_SELLER_MIN_SCORE = 80`
on the on-chain reputation table. ADR-041 collapsed V1 to a **single
1.8 % rate** for the 4-market big-bang launch ; the Top Seller program
ships V1.1 with refined criteria once we have real seller behavior data.

**Where it lives (NOT removed — already deployed on Sepolia) :**

**Contracts ([`packages/contracts/contracts/EtaloReputation.sol`](../packages/contracts/contracts/EtaloReputation.sol)) :**
- Constants : `TOP_SELLER_MIN_ORDERS = 50`, `TOP_SELLER_MIN_SCORE = 80`,
  `TOP_SELLER_SANCTION_COOLDOWN = 90 days`, `AUTO_RELEASE_TOP_SELLER_DAYS = 2`
- Storage : `Reputation.isTopSeller` flag on every seller record
- Functions : `checkAndUpdateTopSeller(address)`, internal promote /
  revoke logic in `recordOrder`
- Events : `TopSellerGranted(seller)`, `TopSellerRevoked(seller)`

**Backend ([`packages/backend/app/services/indexer_handlers.py`](../packages/backend/app/services/indexer_handlers.py)) :**
- Indexer listens to `TopSellerGranted` / `TopSellerRevoked` events but
  the corresponding `Reputation.is_top_seller` mirror column may be
  unused in the V1 query path (sanity-check before V1.1).

**Escrow ([`packages/contracts/contracts/EtaloEscrow.sol`](../packages/contracts/contracts/EtaloEscrow.sol)) :**
- Commission calc internally references `EtaloReputation.isTopSeller()`
  ; V1 deploy hard-codes 1.8 % so the branch is dead-weight on Sepolia.
  Verify the call still resolves on the V1.1 redeploy.

**Reactivation steps (V1.1) :**
1. Decide V1.1 thresholds — ADR-041 explicitly says "may be revisited
   at V1 mainnet deploy time given 4-market big-bang load patterns".
   With real volume data : tune `MIN_ORDERS` + `MIN_SCORE`.
2. Re-enable the commission discount in `EtaloEscrow._calculateCommission`
   (1.2 % for `isTopSeller`, 1.8 % default). Upgrade the contract via
   the existing redeploy path (no proxy — V1 used direct deploys).
3. Expose the Top Seller badge on the boutique header
   (`BoutiqueHeader.tsx`) and possibly a stat card on the seller
   dashboard ("17 orders to Top Seller").
4. Backend : surface `is_top_seller` in `/sellers/{address}/profile`
   if not already.

**Estimated reactivation effort :** 3-5 days (contract changes +
audit, frontend surface, monitoring).

---

## 4. Seller stake (collateral for cross-border + downgrade tiers)

**Deferred by :** [ADR-041](DECISIONS.md) — alongside cross-border
deferral. ADR-018 / ADR-019 cross clause / ADR-020 / ADR-021 originally
required sellers to lock USDT collateral that could be slashed on
unresolved cross-border disputes. With cross-border deferred V2, the
stake's only V1 role was the Top Seller tier gating — also retired.

**Where it lives (deployed on Sepolia, unused by V1 UI) :**

**Contracts :**
- [`packages/contracts/contracts/EtaloStake.sol`](../packages/contracts/contracts/EtaloStake.sol) — full contract : `depositStake`, `withdrawStake`, `slashStake`, `incrementActiveSales` / `decrementActiveSales`, tier ladder (`NONE` / `STARTER` / `GROWTH` / `SCALE`)
- [`packages/contracts/contracts/interfaces/IEtaloStake.sol`](../packages/contracts/contracts/interfaces/IEtaloStake.sol)
- Deployed address : `0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB` (Sepolia)

**Backend :**
- [`app/models/stake.py`](../packages/backend/app/models/stake.py) — `stakes` table mirror
- [`app/models/enums.py`](../packages/backend/app/models/enums.py) — `StakeTier` enum (NONE / STARTER / GROWTH / SCALE) + `STAKE_TIER_ENUM_NAME`
- [`app/services/celo.py`](../packages/backend/app/services/celo.py) — `fetchStake()` read helper
- [`app/services/indexer_handlers.py`](../packages/backend/app/services/indexer_handlers.py) — `StakeDeposited`, `StakeSlashed`, `TierAutoDowngraded` handlers (still write to the mirror table)
- [`app/services/auto_refund_keeper.py`](../packages/backend/app/services/auto_refund_keeper.py) cross-border guard references stake — V1 inert because all orders are intra

**Frontend :**
- `lib/contracts.ts` includes the stake address but **no UI surface
  consumes it in V1**. The original `StakeTab` was retired in J10-V5
  Phase 5 sub-block 5.1 per ADR-041. ABIs in `abis/v2/EtaloStake.json`
  remain (kept for the next-deploy upgrade path).

**Reactivation steps (V2 — cross-border launch) :**
1. Re-deploy contracts with `isCrossBorder` flag turned on (ADR-018).
2. Backend : flip the `auto_refund_keeper` cross-border deadline from
   the 7-day intra default to 14-day (constants already in the keeper
   ; the V2 backend just stops the `is_cross_border=False` filter).
3. Frontend : reintroduce a stake management section in
   `/seller/dashboard` (likely under Profile or a new Stake tab),
   wire the `depositStake` / `withdrawStake` flows.
4. Compliance : V2 cross-border may need its own MSB-light review
   per ADR-021. Block on legal sign-off.

**Estimated reactivation effort :** 5-10 days (contract upgrade +
keeper config + UI + compliance review).

---

## Maintenance contract

When touching any file listed above :
- **Don't delete** without an ADR reversing the deferral.
- **Don't refactor** the public API shape (function signatures,
  table columns, event names) — V1.5+ reactivation expects them as
  they are today.
- **DO** keep dark-mode + a11y polish in sync if the file is touched
  during a cross-cutting refactor (the components still need to
  render cleanly when re-enabled).

When a new dormant feature lands : append a section here, link the
ADR, list the files, write the reactivation steps. Future Mike will
thank you.

---

## Reference

- [`CLAUDE.md`](../CLAUDE.md) — V1 sprint section flags
  `NEXT_PUBLIC_ENABLE_MARKETING_TAB` + `NEXT_PUBLIC_ENABLE_ADDRESS_BOOK`
  as the live gates.
- [`docs/DECISIONS.md`](DECISIONS.md) — ADR-018 / 019 / 020 / 021
  (stake + cross-border), ADR-041 (V1 scope retire), ADR-049 (marketing
  pack pivot), ADR-050 (address book → inline pivot).
- [`docs/PRE_MAINNET_QA.md`](PRE_MAINNET_QA.md) — V1.5+ TODOs adjacent
  to dormant code (SIWE migration, Pinata dedicated gateway, etc.).
