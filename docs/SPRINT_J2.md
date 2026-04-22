# Etalo — Sprint Day 2: Frontend MiniPay Mini App + Public Pages

**Date**: Wednesday, April 22, 2026
**Duration target**: 11-12 hours
**Developer**: Mike (solo)
**AI assistant**: Claude Code (Opus 4.7, 1M context)

---

## Day 2 Mission

Build the end-to-end buyer/seller experience on top of the J1 foundation:
- MiniPay Mini App (Vite + React 19 + Wagmi v2 + shadcn/ui)
- Onboarding flow in 3 steps (discovery → shop → first product)
- Seller dashboard with 6 analytics cards
- Public product pages (Next.js 14 App Router SSR for SEO + social sharing)
- Full USDT checkout flow via on-chain escrow (3-tx sequence)

**End of day checkpoint**: A buyer can land on a shareable web product
page, open the Mini App, confirm an on-chain USDT payment, and see the
funds locked in escrow. The seller sees the new order on their
dashboard.

---

## Architecture Overview

```
etalo/
├── packages/
│   ├── contracts/       Solidity contracts + deploy + e2e scripts
│   ├── miniapp/         Vite + React 19 + Wagmi v2 + shadcn/ui   ← J2
│   ├── web/             Next.js 14 App Router SSR                ← J2
│   ├── backend/         FastAPI + SQLAlchemy + Alembic
│   └── admin/           (empty, deferred)
├── docs/
│   ├── SPRINT_J1.md
│   ├── SPRINT_J2.md     This file
│   ├── DECISIONS.md     Architecture decision log (grew at every J2 block)
│   ├── FRONTEND.md      Frontend technical reference                 ← J2
│   └── ARCHITECTURE.md
└── README.md
```

---

## Time Breakdown

| Block | Task                                               | Time  | Status    |
|-------|----------------------------------------------------|-------|-----------|
| 1     | Scaffold Mini App (Vite + React + Wagmi + shadcn)  | 1h    | Done      |
| 2     | MiniPay connector + Celo Sepolia chain + silent auto-connect | 1h    | Done      |
| 3     | Seller landing + routes + guards + /sellers/me     | 1h    | Done      |
| 4     | Onboarding 3 steps + IPFS uploads + atomic complete| 2h20  | Done      |
| 5     | Seller dashboard (6 cards) + analytics endpoints   | 2h    | Done      |
| 6     | Public web scaffold + product SSR + slug migration | 1h25  | Done      |
| 7     | Checkout flow (3-tx USDT) + orders backend         | 2h    | Done      |
| 8     | QA mobile device + ngrok                           | 1h    | Done      |
| 9     | Documentation + final commit                       | 30m   | This block|
| Total |                                                    | ~12h  |           |

---

## Commits (J2)

| Hash      | Subject                                                                  |
|-----------|--------------------------------------------------------------------------|
| `fc03790` | feat(miniapp): scaffold Vite + React + Wagmi v2 + shadcn/ui              |
| `204967b` | feat(miniapp): MiniPay connector, Celo Sepolia chain, silent auto-connect|
| `51bc2a3` | feat(miniapp): landing + routes + guards + sellers/me endpoint           |
| `11d08a6` | feat(miniapp): onboarding 3 steps + ipfs uploads + atomic complete       |
| `10b2ae3` | chore(backend): align Pinata env naming + wire real upload               |
| `8857179` | feat(miniapp): seller dashboard 6 cards + analytics endpoints            |
| `170d5cc` | feat(web): scaffold + product page SSR + slug migration                  |
| `14f9d2d` | feat(miniapp): checkout USDT flow + orders backend                       |
| `ba28969` | fix(miniapp): display seller logo in ShopHandle (dashboard + checkout)   |

---

## Architectural Decisions (recap of docs/DECISIONS.md)

Every non-trivial choice was logged in `docs/DECISIONS.md` the same day.
Key J2 entries:

1. **React 19 + TypeScript 6 accepted** — overrides CLAUDE.md v1 (React 18).
2. **Wagmi v2 retained** (not v3) — ecosystem docs for v3 still thin.
3. **`X-Wallet-Address` header as temporary auth** — replaces JWT until
   proper auth block. Guard: `ENFORCE_JWT_AUTH=true` rejects the header
   and returns 501. **Never deploy with the header accepted.**
4. **MiniPay native deep-link deferred** — CTA uses plain HTTPS to
   `${NEXT_PUBLIC_MINIAPP_URL}/checkout/{id}`.
5. **Raw IPFS og:image for V1** — real 1200x630 generator deferred V1.5.
6. **3-tx checkout accepted** — `createAndFund` wrapper deferred V1.5.
7. **CIP-64 fee-in-USDT deferred V1.5** — MiniPay's gas sponsorship
   handles the missing-CELO case in practice.
8. **On-chain event indexer deferred V1.5** — frontend POSTs tx hashes
   to `/orders/confirm` today; DB trusts the hashes.
9. **Buyer country defaults to cross-border** — unknown buyer → 2.7%
   commission + 7-day auto-release (safer pessimistic default).
10. **1 confirmation on Celo Sepolia** — bump to 2-3 before mainnet.
11. **MockUSDT accepts allowance overwrite** — mainnet USDT needs to be
    verified (may require `approve(0)` first, race-condition prevention).
12. **WhatsApp notifications stored, not sent** — Twilio not wired;
    `sent=false` rows await a future worker.

---

## Technical Debt Tracker

Items explicitly deferred from J2 that must be addressed before a
public launch. Order roughly by urgency.

### P0 — blockers for deployment

| Item                                            | Where               | Why it matters                                                          |
|-------------------------------------------------|---------------------|-------------------------------------------------------------------------|
| JWT auth dependency                             | `get_current_wallet`| `X-Wallet-Address` header is impersonation-vulnerable; deploy with `ENFORCE_JWT_AUTH=true` blocks the route. |
| Production URL / domain                         | `NEXT_PUBLIC_*` env | Dev values hardcoded to localhost. Needed for real shares + MiniPay submission. |
| Mainnet USDT allowance-reset check              | `useCheckout`       | If Celo mainnet USDT requires `approve(0)` before changing, current code will revert for re-buyers. |

### P1 — degraded UX on the way to V1

| Item                                            | Where               | Why it matters                                                          |
|-------------------------------------------------|---------------------|-------------------------------------------------------------------------|
| WhatsApp send worker (Twilio)                   | `notifications`     | Sellers aren't actually notified today.                                 |
| On-chain event indexer                          | new service         | DB can drift from chain state if the frontend crashes after fundOrder.  |
| Reputation on-chain indexing                    | `ReputationBlock`   | Dashboard shows `badge: new_seller` for everyone until wired.           |
| Buyer country at first checkout                 | Mini App            | Intra-Africa buyers are taxed as cross-border until they set country.   |
| Landing design polish (logo, palette, hero, type)| `web/app/page.tsx` | Flagged "basique, pas premium" during Block 8 QA — P1 for Proof of Ship.|

### P2 — polish

| Item                                            | Where               | Why it matters                                                          |
|-------------------------------------------------|---------------------|-------------------------------------------------------------------------|
| Dynamic OG image generator (1200x630)           | `web/app/.../opengraph-image.tsx` | Raw IPFS image ships today; social previews will resize awkwardly.       |
| `read_at` column on Notification                | Alembic migration   | "Unread count" is faked (== total) without it.                          |
| CIP-64 fee-in-USDT                              | `lib/tx.ts`         | Buyers without CELO currently depend on MiniPay's sponsorship.          |
| MiniPay native deep-link scheme                 | web `BuyButton`     | Plain HTTPS works but adds one tap for social-share arrivals.           |
| `createAndFund` wrapper contract                | new Solidity        | Would cut checkout from 3 txs to 2.                                     |
| Checkout UI end-to-end with 2 wallets           | manual QA           | On-chain flow already green via `e2e-checkout.ts`; UI self-buy blocked by 409 + escrow `require(seller != msg.sender)`. Needs a second MiniPay wallet as buyer. |

---

## What Works vs What's Not UI-Tested

### Validated on-chain and backend

- Escrow contract flow: `approve` + `createOrder` + `fundOrder`
  executed successfully against Celo Sepolia via
  `packages/contracts/scripts/e2e-checkout.ts`.
  - mint tx    `0xc9787100ed6fc4b14ce030fa7f2666706878b667f6dd8574d80fa9bfb820c89b`
  - approve tx `0x5bb8772ad520a2de6eba8c48158ca8dadbbe021bb7efd4d1afc71610a9ca8278`
  - create tx  `0xd551efbc10c6c15f1b0761eeb73677ae4e4e94a7f24e3da4cd76221bda9af7aa`
  - fund tx    `0x0deac8478de90ed274169981d0d319248a2d939130278321c9dd862de52d9cba`
  - Resulting `Order.status == Funded` on-chain, commission =
    0.09 USDT = 1.8 % of 5 USDT (intra-Africa rate verified).
- Alembic migration `a1b2c3d4e5f6_add_slug_to_products` applied with
  live data: 3 existing products backfilled with slugs, unique
  constraint `uq_products_seller_slug` enforced.
- Backend endpoints responding 200 with correct payload shape:
  - `POST /api/v1/sellers/handle-available/{handle}`
  - `POST /api/v1/uploads/ipfs` (real Pinata upload returned
    `QmTXSn2mVKNAwBTL5AY9yMHUqVGSEKmfQb53pzUsp58yUN`)
  - `POST /api/v1/onboarding/complete` (atomic User + SellerProfile +
    Product creation with 409 on duplicate wallet or handle)
  - `GET /api/v1/analytics/summary` (empty-state zeros for new sellers)
  - `GET /api/v1/notifications?limit=3`
  - `GET /api/v1/products/public/{handle}/{slug}` (unauth, with
    `Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=300`)
  - `POST /api/v1/orders/initiate` (authoritative `is_cross_border`
    computation, defaults true for unknown buyer country)
  - `POST /api/v1/orders/confirm` (idempotent by `onchain_order_id`,
    creates `Notification(sent=false)` row)
- Frontend typecheck: `npx tsc -b --noEmit` in `packages/miniapp` and
  `npx tsc --noEmit` in `packages/web` both pass.
- Next.js SSR rendering: `curl` on the product page returns HTML with
  `og:title`, `og:description`, `og:image` (1200x630), `og:url`,
  `twitter:card=summary_large_image`, and the formatted price
  "12.50 USDT" in the body.
- Vite dev server optimizes wagmi, viem, react-query, recharts on
  first render without errors.

### Known untested in the UI

- **Browser flow end-to-end with MetaMask on Firefox** — blocked by a
  "No keyring found" error from MetaMask / Wagmi injected connector
  detection on this machine. The issue is environmental, not logic:
  the same useCheckout code path succeeded on-chain via the e2e script
  using the same PK. To be retested on Chrome or directly on a
  MiniPay device.
- **MiniPay device (Android, testnet enabled)** — full deferred to
  Block 8 (tomorrow): ngrok tunnel, scan QR, run the whole
  onboarding → checkout → order recap flow with a real MiniPay
  WebView. Items to audit during that block:
  - Silent auto-connect (no "Connecting…" message)
  - Touch targets ≥ 44x44 px
  - Body text ≥ 16 px
  - Safe areas respected on both iOS-style and Android notches
  - No "gas" / "crypto" / "token" / "0x…" leaking to the UI
  - 4-state transaction indicator (Preparing / Confirming /
    Success / Error) shows correctly through a full 3-tx checkout
  - MiniPay gas sponsorship works (buyer without CELO can pay)

---

## Preparation for Block 8 (tomorrow)

Block 8 is **QA on a real MiniPay Android device over ngrok**. Prereqs:

1. `ngrok` installed and logged in (ngrok.yml with reserved subdomain
   if possible; the MiniPay testnet bundle needs a stable URL).
2. `packages/miniapp` dev server on port 5173 tunneled:
   `ngrok http --host-header=localhost 5173`
3. Update `NEXT_PUBLIC_MINIAPP_URL` in `packages/web/.env.local` to
   the ngrok URL so the "Buy with MiniPay" deep-link points there.
4. Also tunnel the backend (port 8000) and set
   `VITE_API_URL` in `packages/miniapp/.env.local` to its ngrok URL.
5. Mint additional MockUSDT to the MiniPay device wallet via
   `scripts/mint-test-usdt.ts` (not the deployer wallet).
6. Walk through the checklist from the "Known untested" section above.
7. Log any regression as a separate commit scope before attempting
   fixes.

---

## Block 8 — Validation

**Date**: April 22, 2026
**Device**: Android with MiniPay (testnet mode)
**ngrok URL**: `https://upright-henna-armless.ngrok-free.dev` (tunnel → Vite `:5173`)

### Setup

- ngrok 3.38.0 installed and configured (free account)
- Vite config: `allowedHosts` + proxy `/api/*` → `localhost:8000`
- Mint MockUSDT: 100 mUSDT on MiniPay wallet
  `0x3154835dEAf9DF60A7aCaf45955236e73aD84502`

### Bug discovered and fixed in live conditions

- **Bug**: shop logo never rendered in `ShopHandle` (text-only component).
- **Fix**: added `logoIpfsHash` prop to `ShopHandle`, propagated through
  `SellerHome` and `CheckoutSummary`.
- **Backend**: added `logo_ipfs_hash` to `OrderInitiateResponse.seller`
  (optional, non-breaking).
- **Commit**: `ba28969` — `fix(miniapp): display seller logo in ShopHandle (dashboard + checkout)`.

### Validated tests

- **Onboarding 3 steps**: full flow on Android MiniPay, Supabase DB written.
- **Dashboard `/seller`**: 6 cards empty-state OK, logo visible in header.
- **Page `/checkout/:productId`**: loads correctly, self-buy 409 correctly surfaced.
- **Terminology audit** (Landing / Dashboard / Onboarding 3 steps):
  no "gas", "crypto", "token", or raw `0x…` addresses visible.
- **Dashboard design audit**: OK.

### Partial / deferred tests

- **Checkout end-to-end** (approve + createOrder + fundOrder):
  blocked by self-buy protection (only one MiniPay wallet available).
  On-chain flow already validated in Block 7 via `e2e-checkout.ts`.
  UI pass needs a second buyer wallet.
- **Landing design**: judged "basic, not premium" — polish scheduled
  for a dedicated J3 session.

### Tech debt identified during Block 8

1. Landing design polish (logo, palette, hero image, typography) — **P1** for Proof of Ship.
2. Checkout UI end-to-end with two wallets — **P2** (on-chain already green).

---

## Final Checklist J2

- [x] Mini App scaffolded, routes wired, guards in place
- [x] MiniPay connector with silent auto-connect
- [x] Onboarding 3 steps with IPFS uploads and atomic DB write
- [x] Seller dashboard 6 cards with real backend aggregation
- [x] Next.js public product page with SSR OpenGraph
- [x] Full on-chain checkout flow (approve + createOrder + fundOrder)
- [x] Backend orders endpoints with idempotency
- [x] Alembic slug migration applied with live backfill
- [x] Real Pinata uploads validated
- [x] docs/DECISIONS.md logs all non-trivial J2 choices
- [x] Block 8: mobile device QA on Android MiniPay

---

## Notes & Decisions Log

- **Finding during Block 7**: the deployed `EtaloEscrow.createOrder`
  takes `(address seller, uint256 amount, bool isCrossBorder)` —
  3 params, no `productId`. productId is maintained off-chain only,
  in `orders.product_id` linked to `orders.onchain_order_id`.
- The whole frontend stack (miniapp + web) is independent from the
  smart-contract redeploy cycle. If the escrow contract is upgraded,
  only `packages/miniapp/src/abis/EtaloEscrow.json` and
  `packages/backend/.env` need changes.
- `settings.local.json` under `.claude/` tracks the harness's
  permission grants from this session and is committed separately
  from functional work.
