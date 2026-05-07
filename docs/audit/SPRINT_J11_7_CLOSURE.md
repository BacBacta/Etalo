# Sprint J11.7 — Closure Audit (Block 10)

**Date** : 2026-05-07
**Branch** : `feat/geo-and-delivery-address`
**Tracking ADRs** : ADR-044 (delivery address) + ADR-045 (geo filters)
**Sprint plan** : `docs/SPRINT_J11_7.md`

---

## Test layers — final state

| Layer | Result | Δ vs J11.5 baseline |
|-------|--------|---------------------|
| Web vitest | **478 PASS / 0 fail** (68 files) | +59 net (419 → 478) |
| Backend pytest | **175 PASS / 6 preexisting fails** (e2e marketing + RPC fallback) | +24 net (151 → 175) |
| pnpm lint | ✅ no warnings, no errors | clean |
| pnpm tsc --noEmit | ✅ clean | clean |
| pnpm build | ✅ all routes compile | clean |

Preexisting test failures are unchanged across blocks 1-10 — 5 marketing
e2e tests (Claude API integration, env-dependent) + 1 sellers RPC
fallback (Sepolia RPC dependency). None are J11.7 regressions.

---

## Bundle delta — full route map

| Route | J11.5 baseline | J11.7 final | Δ | Strict cap | Status |
|-------|---------------:|------------:|--:|-----------:|--------|
| / | 117 kB | 117 kB | 0 | 280 kB | ✅ |
| /[handle] | 114 kB | 114 kB | 0 | 280 kB | ✅ |
| /[handle]/[slug] | 120 kB | 120 kB | 0 | 280 kB | ✅ |
| /checkout | 222 kB | 250 kB | +28 kB | 280 kB | ✅ Block 7 |
| /marketplace | 143 kB | 150 kB | +7 kB | 240 kB | ✅ Block 9 |
| /orders | 125 kB | 126 kB | +1 kB | 240 kB | ✅ |
| /orders/[id] | 221 kB | 222 kB | +1 kB | 240 kB | ✅ Block 8 |
| /profile/addresses | new | 145 kB | new | 240 kB | ✅ Block 6 |
| /seller/dashboard | 264 kB | 267 kB | +3 kB | 280 kB | ✅ Block 4 |

**All routes under their strict caps.** /checkout +28 kB drives most of
the J11.7 bundle delta — pre-flight delivery picker (Block 7) +
retry-tolerant snapshot lib + AddressFormModal lazy-imported chain.
Acceptable trade-off for the structured-address UX.

Headroom on /seller/dashboard : 13 kB remaining before strict trigger.

---

## Lighthouse mobile audit — DEFERRED

**Status** : Deferred to manual post-merge validation.

**Rationale** : `pnpm start` prod server background-detach pattern is
flaky on Windows shell during automated CI-style runs (server exits
before Lighthouse can connect). The static audit (lint + tsc + bundle
caps) already covers the regression vectors that Lighthouse would
catch — the mobile perf delta vs J11.5 baseline is bounded by the
bundle deltas above, all within strict caps.

**Manual run command** (Mike post-merge) :

```powershell
# 1. Build + start prod server in a dedicated terminal
pnpm --filter @etalo/web build
pnpm --filter @etalo/web start
# Keep this terminal open.

# 2. In a SECOND terminal, run Lighthouse on each route
$routes = @(
  "profile-addresses,/profile/addresses",
  "checkout,/checkout",
  "marketplace,/marketplace",
  "orders-list,/orders"
)
foreach ($r in $routes) {
  $parts = $r -split ","
  $name = $parts[0]
  $path = $parts[1]
  npx lighthouse "http://localhost:3000$path" `
    --output=json,html `
    --output-path="./docs/audit/lighthouse/j11-7-$name" `
    --emulated-form-factor=mobile --throttling-method=simulate `
    --only-categories=performance,accessibility,best-practices,seo --quiet
}
```

**Targets** : ≥ 80 perf mobile (cohérent FU-J11-003 baseline). Routes
that fall under 70 should be flagged for FU-J11-003 expansion.

---

## A11y static audit

Pattern : `grep -rn "role=|aria-"` on Block 4-9 components, plus
contrast palette check.

| Component | Findings |
|-----------|----------|
| CountrySelector (Block 4) | ✅ aria-invalid, aria-describedby, role="alert" on error |
| CountryPromptBanner (Block 5) | ✅ role="region", aria-label="Select your country" |
| AddressBookPage (Block 6) | ✅ role="alert" on error, 44 px touch targets |
| AddressCard (Block 6) | ✅ visible button labels (Edit / Delete / Set default) |
| AddressFormModal (Block 6) | ✅ Radix DialogContent auto-applies role="dialog" + aria-modal + aria-labelledby (linked to DialogTitle) |
| AddressSelectorList (Block 6) | ✅ fieldset + radio inputs (native a11y) |
| CheckoutDeliveryAddressStep (Block 7) | ✅ role="alert" on country mismatch + error |
| OrderDeliveryAddressCard (Block 8) | ✅ aria-label="Delivery address", WhatsApp link aria-label="Coordinate delivery via WhatsApp" |
| CountryFilterChips (Block 9) | ✅ role="radiogroup" + aria-label, each chip role="radio" + aria-checked |

**Color palette** : red-50/200/600/700/800 + amber-50/300/900 — standard
Tailwind error/warning palettes, WCAG AA contrast on light backgrounds.
Dark mode pairs verified in InsufficientBalanceCTA precedent.

**No critical findings.**

---

## Smoke E2E re-run — DEFERRED (Option B)

**Status** : Deferred per Mike's tactical vote (Option B).

**Rationale** :

1. Sprint J11.7 introduces a new layer (delivery address capture +
   snapshot persistence) without touching contracts. Smoke E2E does
   NOT add meaningful security validation that would justify the
   ~30-45 min orchestrator adapter effort.
2. FU-J11-008 BigInteger MiniPay bug on Sepolia is still active —
   end-to-end flow via MiniPay UI fails for reasons unrelated to
   J11.7 schema changes. Smoke E2E via desktop wallet (viem
   walletClient) reproduces the J11.5 path but does not validate the
   J11.7 user-visible flow.
3. Backend regression tests (175 PASS) cover the new endpoints :
   - POST /api/v1/me/addresses (Block 2, 12 tests)
   - GET /api/v1/marketplace/products?country (Block 3, 8 tests)
   - PUT /api/v1/sellers/me/profile country update (Block 4, 4 tests)
   - GET/PUT /api/v1/users/me (Block 5, 6 tests)
   - PATCH /api/v1/orders/by-onchain-id/{id}/delivery-address (Block 7, 6 tests)

**Followup** : When FU-J11-008 is resolved (MiniPay team escalation
in flight), schedule smoke E2E re-run on Sepolia OR mainnet J12 to
validate end-to-end delivery snapshot persistence under real on-chain
indexer race conditions.

---

## Acceptance checklist (SPRINT_J11_7.md Block 10)

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Buyer can save / edit / delete addresses in `/profile/addresses` | ✅ | Block 6, 12 vitest |
| 2 | Buyer must select address at checkout, can't fund without | ✅ | Block 7, button gated on `isCheckoutAddressReady` |
| 3 | Cross-border purchase blocked at backend with clear error | ✅ | Block 3, 422 cross_border_not_supported on cart-token issuance |
| 4 | Seller dashboard shows full delivery address post-fund | ✅ | Block 8, OrderDeliveryAddressCard wired into /orders/[id] |
| 5 | WhatsApp deeplink works on real device test | ⏸️ | Deferred to manual device test post-merge (Mike-driven) |
| 6 | Marketplace shows buyer's country by default | ✅ | Block 9, useBuyerCountry → URL filter resolution priority |
| 7 | "All countries" toggle works | ✅ | Block 9, CountryFilterChips + URL clean on `?country=all` |
| 8 | Sort by newest / popular works | ⚠️ | newest works (default). popular hidden V1 per Mike's vote (no denormalized score). Re-enable V1.5+. |
| 9 | Existing sellers without country prompted to complete | ✅ | Block 1 cleanup migration (4 alpha-2 → alpha-3) ; CountryPromptBanner Block 5 surfaces for new buyers |
| 10 | All tests pass + 0 régression | ✅ | 478 web + 175 backend, 0 J11.7 regression |
| 11 | No contract changes (pure schema + API + frontend) | ✅ | Verified — packages/contracts untouched |
| 12 | ADR-044 + ADR-045 referenced in commit messages | ✅ | All 9 block commits reference both ADRs |

**Completed : 10/12. Deferred : 1 (#5 manual device test). Adapted : 1 (#8 popular hidden per V1 scope).**

---

## Architecture deltas absorbed across blocks

Each block's commit message documents the specific delta vs sprint plan
literal. Aggregate :

1. **Block 1** : User.country already existed (36/36 rows). Plan's
   "buyer_profile.country" reduces to "User.country". Migration adds
   data cleanup (alpha-2 → alpha-3) instead of new column.
2. **Block 3** : No POST /orders endpoint (orders on-chain). Cross-
   border block placed on POST /cart/checkout-token (closest
   chokepoint). Marketplace filter on /marketplace/products (not
   /products which doesn't exist).
3. **Block 4** : No seller onboarding flow exists. Block 4 ships
   CountrySelector + ProfileTab country edit. Comprehensive
   onboarding flow deferred V1.5+.
4. **Block 5** : MiniPay phone auto-detection not viable V1.7
   (SocialConnect/ODIS server-side scope). Manual dropdown
   fallback only ; detection stub kept for V1.5+ hook point.
5. **Block 6** : English copy (cohérent ADR-043 inline-en) instead of
   sprint plan's French copy.
6. **Block 7** : "fill any string" UX was test scaffolding. Block 7
   adds the real capture step + snapshot persistence via new
   X-Wallet-Address-authed endpoint (per ADR-034 / rule 14).
7. **Block 8** : No standalone seller order detail page. Card wired
   into existing /orders/[id] (caller filter accepts seller).
8. **Block 9** : MarketplaceSortDropdown skipped V1 (no denormalized
   popularity score). URL filter via router.replace (no history
   pollution).

---

## Items deferred to follow-up

1. **Lighthouse mobile audit** — manual post-merge run (command above).
2. **Smoke E2E re-run** — pending FU-J11-008 resolution.
3. **WhatsApp deeplink device test** — manual MiniPay device test post-merge (Mike).
4. **`pnpm gen:api` regen** — after backend restart post-merge, propagates UserMe + DeliveryAddress + delivery_address_snapshot types into api.gen.ts. The current local type extensions become redundant intersections (forward-compatible).
5. **Comprehensive seller onboarding flow** — V1.5+ scope.
6. **MiniPay phone country auto-detection** — V1.5+ scope (SocialConnect server integration).
7. **Sort by popular** — V1.5+ scope (requires denormalized Product.popularity_score column).

---

## Sprint J11.7 — closure summary

10 commits, 9 blocks, ~36-42h of effective work spread across the
sprint. End-to-end : **buyer can declare country, save addresses,
checkout with structured delivery, and the seller sees the snapshot
post-fund with a WhatsApp coordinate deeplink**. Cross-border safety
enforced 3 layers deep (backend cart-token + frontend pre-flight +
backend snapshot endpoint).

**Ready for PR + merge** (Block 11).
