# Lighthouse Mobile baseline — Sprint J11 listing prep

**Date** : 2026-05-06
**Build** : `pnpm build` prod (Next.js 14.2.35 production mode)
**Method** : Lighthouse CLI 13.2.0, mobile emulation, simulated 4G throttling, headless Chrome
**Branch** : `ops/pagespeed-baseline-j11`
**MiniPay listing prereq** : §4 (per `minipay-requirements.md`, target **Performance ≥ 90 mobile**)

---

## Bundle size summary (from `pnpm build` output)

```
Route (app)                              Size     First Load JS
┌ ○ /                                    6.05 kB         117 kB
├ ○ /_not-found                          153 B            88 kB
├ ƒ /[handle]                            2.95 kB         114 kB
├ ƒ /[handle]/[slug]                     4.95 kB         120 kB
├ ƒ /[handle]/[slug]/opengraph-image     0 B                0 B
├ ƒ /[handle]/opengraph-image            0 B                0 B
├ ○ /checkout                            8.25 kB         220 kB
├ ○ /dev/components                      12.7 kB         162 kB
├ ○ /legal/privacy                       153 B            88 kB
├ ○ /legal/terms                         153 B            88 kB
├ ○ /marketplace                         9.83 kB         143 kB
├ ○ /robots.txt                          0 B                0 B
├ ○ /seller/dashboard                    24.1 kB         264 kB
└ ○ /sitemap.xml                         0 B                0 B
+ First Load JS shared by all            87.8 kB
  ├ chunks/2117-17024416b05954fe.js      31.9 kB
  ├ chunks/fd9d1056-6e603a8a23a2114b.js  53.6 kB
  └ other shared chunks (total)          2.28 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Dashboard is heaviest (264 kB First Load JS) — driven by tabs + analytics charts. Checkout next (220 kB) — driven by cart + USDT balance reads + checkout state machine.

---

## Scores summary (prod build)

| Surface | URL | Performance | Accessibility | Best Practices | SEO | vs ≥90 target |
|---|---|---|---|---|---|---|
| home | `/` | **85** | 100 | 100 | 100 | -5 |
| boutique-public | `/smoke_b2` | **86** | 94 | 96 | 100 | -4 |
| product detail | `/smoke_b2/smoke-product` | **88** | 96 | 96 | 100 | -2 |
| marketplace | `/marketplace` | **78** | 94 | 100 | 100 | -12 |
| checkout | `/checkout` (no token, redirects/empty cart) | **77** | 96 | 100 | 100 | -13 |
| seller dashboard | `/seller/dashboard` | **79** | 100 | 100 | 100 | -11 |

**Verdict** :
- ✓ All surfaces ≥ 77 perf (no red flag, no <30 critical surface)
- ✓ A11y / BP / SEO solid (94-100 across all 6) — no listing-blocking accessibility / web-standards issues
- ⏳ Performance gap to MiniPay listing target (≥90) :
  - **3 surfaces close** : home (-5), boutique (-4), product (-2)
  - **3 surfaces 11-13 points off** : marketplace, checkout, dashboard

---

## Per-surface details

Reports archived in this directory :

| Surface | HTML report | JSON report |
|---|---|---|
| home | `home-prod.report.html` | `home-prod.report.json` |
| boutique | `boutique-prod.report.html` | `boutique-prod.report.json` |
| product | `product-prod.report.html` | `product-prod.report.json` |
| marketplace | `marketplace-prod.report.html` | `marketplace-prod.report.json` |
| checkout | `checkout-prod.report.html` | `checkout-prod.report.json` |
| dashboard | `dashboard-prod.report.html` | `dashboard-prod.report.json` |

For the sub-80 surfaces (marketplace, checkout, dashboard), the dominant Lighthouse audit findings are :

### marketplace (Perf=78)
- **Forced reflow** : DOM read/write interleaving causes layout thrash
- **Mainthread work breakdown** : large JS execution block on initial load
- **Render-blocking requests** : critical CSS/JS blocking first paint
- **Network dependency tree** : long chain of dependent fetches before render
- **Legacy JavaScript (50%)** : ES5-targeted polyfills shipped to modern browsers

### checkout (Perf=77)
- **Largest Contentful Paint (LCP) = 52%** : late hero rendering, likely because checkout SSR fetches cart token + USDT balance before initial paint
- **Render-blocking requests**, **mainthread work**, **legacy JavaScript** — same family
- **Unused JavaScript** : checkout ships code paths for variants user doesn't reach (multi-seller cart, dispute UI hooks, etc.)

### dashboard (Perf=79)
- **Max Potential First Input Delay (FID) = 46%** : large interaction loops on tab switch / analytics chart hydration
- **Forced reflow** : tab content layout on click
- **Unused JavaScript** : dashboard ships all 6 tab contents up-front (Overview / Profile / Products / Orders / Marketing / Settings)
- **Mainthread work** : recharts hydration + tabular data rendering

---

## Action items (pre-J12 mainnet listing)

Performance gap to ≥90 target across 3 surfaces (marketplace, checkout, dashboard) is non-trivial but tractable. Common pattern : **bundle splitting + lazy loading + unused JS pruning**.

Suggested optimization PR scope (Sprint J11+ or J12 pre-mainnet) :

1. **Code-split heavy tab content in dashboard** : convert `/seller/dashboard` tabs (Overview / Marketing / Products / Orders / etc.) to `next/dynamic` with `ssr: false` so each tab only loads when activated. Expected +5-10 perf points.
2. **Defer chart hydration on dashboard** : recharts is heavy (~80 kB gzip). Use IntersectionObserver to lazy-mount charts only when scrolled into view. Expected +3-5 perf points.
3. **Audit unused JavaScript on checkout** : run `next build && pnpm exec next-bundle-analyzer` (or `ANALYZE=true pnpm build` per `next.config.mjs`) to identify dead-code paths. Likely candidates : unused dispute hooks, multi-seller cart code, viem chains other than Celo Sepolia.
4. **Lazy-load below-the-fold marketplace product cards** : marketplace renders all visible products eagerly. Convert product card images to `loading="lazy"` (likely already done via next/image — verify) + virtualize if list grows beyond viewport.
5. **Audit legacy JavaScript polyfills** : Lighthouse flags 50% on marketplace + checkout for ES5-targeted polyfills. Modern browser users (MiniPay = Chromium-based) don't need these. Audit Babel/swc presets for browserslist tightening.

Optimization estimate : ~1-2 sprint days targeted work. Defer if J12 timeline tight ; non-blocking if MiniPay listing reviewers tolerate 78-88 range (they may, given A11y/BP/SEO are 94-100).

---

## Comparison dev vs prod build (sanity)

The same `home` surface scored very differently :

| Mode | Performance |
|---|---|
| Dev mode (`pnpm dev`) | **23** |
| Prod mode (`pnpm build && pnpm start`) | **85** |

Delta : **+62 points**. This validates that the dev-mode score is **not representative** of MiniPay listing readiness. Reasons for dev-mode penalty :
- Hot Module Replacement (HMR) scripts injected into bundle
- Source maps loaded full
- React DevTools dev hooks enabled
- No tree-shaking / minification / chunk-splitting
- Compile-on-demand of routes (slow first paint after a route change)

→ Always benchmark **prod build** for listing-readiness checks. Never rely on dev mode scores.

The dev mode home report is preserved as `home-mobile.report.{html,json}` for reference (different naming from the `*-prod.report.*` files). Can be deleted when no longer useful.

---

## Method (reproducibility)

```bash
# 1. Pre-build sanity : confirm .env.local has 7 NEW V2 addresses
grep -E "NEXT_PUBLIC_(USDT|ESCROW|DISPUTE|STAKE|VOTING|REPUTATION|CREDITS)_ADDRESS" packages/web/.env.local

# 2. Stop dev frontend (Mike-driven, Ctrl+C on pnpm dev terminal)

# 3. Build prod
cd packages/web && pnpm build

# 4. Start prod (port 3000)
pnpm start &

# 5. Ensure backend up (uvicorn :8000)
cd packages/backend && python scripts/run_dev.py &

# 6. Run Lighthouse on each surface
npx lighthouse "http://localhost:3000/" \
  --output=json,html \
  --output-path=./docs/audit/lighthouse/home-prod \
  --chrome-flags="--headless --no-sandbox" \
  --quiet
# ...repeat for boutique, product, marketplace, checkout, dashboard

# 7. Stop prod (kill node :3000) + restart dev
```

Lighthouse 13.2.0 default form factor = mobile (Moto G4 emulation, simulated 4G Slow throttling, 4x CPU slowdown).

---

## Audit checklist mapping

This document satisfies :
- **MiniPay listing prereq §4** : PageSpeed Insights ≥ 90 mobile (3 surfaces close, 3 surfaces need optimization PR pre-mainnet)
- **`docs/NETWORK_MANIFEST.md` audit checklist** : "PageSpeed Insights score captured for production URL (mobile, throttled 4G)" — partially satisfied (localhost prod, not yet etalo.app)

---

## Time spent

~10 minutes (well under the 30-min estimate). Hardhat/Lighthouse CLI parallel + scripted batch runs.

---

**End of baseline.** Optimization PR queued for Sprint J11+ or J12 pre-mainnet.
