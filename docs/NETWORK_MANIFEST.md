# Etalo Network Manifest

Required by MiniPay submission (`docs/MINIPAY_LISTING.md` §2 : "provide a full manifest of every URL, subdomain, and origin your app calls"). MiniPay reviews this for supply-chain risk before listing.

This file is the canonical inventory of every network destination Etalo touches at runtime, along with the role and verification status. Each section MUST be empirically verified via DevTools Network panel on the 6 hot-path surfaces before submission (audit checklist at the bottom).

Last updated : `2026-06-15` (doc refresh — mainnet contract addresses +
notification providers). **Empirical hot-path network-panel verification
(the 6 surfaces below) is still pending — see the audit checklist.**
Verifier (empirical) : `[name — pending]`
Submission target : Sprint J12 (MiniPay listing submission)

## Domains & origins

### Production
- `etalo.xyz` — **canonical V1 root domain** (Vercel alias since 2026-05-25), public funnel + MiniPay surface. **All submitted URLs use `etalo.xyz`.**
- `etalo.app` — reserved/future, **NOT wired in V1** (do NOT submit etalo.app URLs). No runtime call targets `*.etalo.app`.
- `*.etalo.xyz` — no subdomains in use (confirm at submission)
- `etalo-api.fly.dev` — backend API host (Fly.io, region jnb)
- ImprovMX MX/SPF on `etalo.xyz` route `support@etalo.xyz` (inbound email only — not a runtime app origin)

### Staging
- TBD (will surface during Sprint J11 staging environment setup)

### Dev
- ngrok URLs : rotative, reserved subdomain `upright-henna-armless.ngrok-free.dev` for stable testing window. Listed at submission time only if dev URL is included in the submission scope.

## Backend APIs

FastAPI service rooted at `/api/v1` :

- `GET /api/v1/health` — liveness
- `GET /api/v1/health/db` — db connectivity
- `GET /api/v1/health/redis` — redis connectivity
- `GET /api/v1/sellers/me` — current seller profile (X-Wallet-Address auth, ADR-036)
- `PATCH /api/v1/sellers/me` — update seller profile
- `GET /api/v1/sellers/{seller_address}/profile` — public seller view
- `GET /api/v1/sellers/{seller_address}/orders` — seller orders feed
- `GET /api/v1/products/me` — owner product list
- `POST /api/v1/products` — create product
- `PUT /api/v1/products/{id}` — update product
- `DELETE /api/v1/products/{id}` — delete product
- `GET /api/v1/products/public/{handle}/{slug}` — SSR product detail
- `GET /api/v1/marketplace/products` — paginated marketplace feed
- `POST /api/v1/cart/checkout-token` — cart token creation (HMAC-signed)
- `GET /api/v1/cart/resolve/{token}` — cart token resolution
- `POST /api/v1/uploads/image` — IPFS upload via Pinata
- `POST /api/v1/onboarding/complete` — atomic seller onboarding (gated by the one-time boutique creation fee once `FEES_ENFORCED_FROM` passes, ADR-059)
- `GET /api/v1/notifications` — wallet notifications feed
- `GET /api/v1/analytics/summary` — seller dashboard aggregates
- `GET /api/v1/sitemap/data` — public sitemap data
- `GET /api/v1/sellers/me/credits/balance` — credits balance for asset generator
- `GET /api/v1/sellers/me/credits/history` — credits ledger entries
- `GET /api/v1/stats` — public platform stats (orders/GMV/commission aggregates)
- `GET /api/v1/treasury/revenue/summary` — owner-only revenue recap (allowlist-gated)
- `GET /api/v1/treasury/revenue.csv` — owner-only revenue CSV export (allowlist-gated)
- `[other]` — to be enumerated exhaustively at submission time via FastAPI OpenAPI introspection (`/api/openapi.json`)

Backend exposed in production at `etalo-api.fly.dev` (Fly.io, region jnb) ; dev exposes via ngrok rewrite (`LOCAL_API_REWRITE_TARGET=http://localhost:8000` in `.env.local`).

## RPC providers

- Celo Mainnet : `forno.celo.org` (default Celo Foundation public RPC)
- Celo Sepolia testnet : `celo-sepolia.drpc.org` (drpc public RPC)
- Fallback / paid tier : TBD (consider Alchemy or QuickNode for production rate limits)

Frontend uses `NEXT_PUBLIC_CELO_RPC_URL` env var (set in `.env.local` per environment).

## Storage / IPFS

- Pinata gateway : `gateway.pinata.cloud` (canonical URL `https://gateway.pinata.cloud/ipfs/<hash>`)
- Pinata API : `api.pinata.cloud` (backend uploads only ; frontend never calls Pinata API directly)
- next.config.mjs `images.remotePatterns` whitelist : `gateway.pinata.cloud`, `*.mypinata.cloud`, `ipfs.io` (fallback)

## Notifications

- Twilio WhatsApp Business API : `api.twilio.com` (backend calls only ; WhatsApp channel, pending Meta business verification)
- Africa's Talking SMS : `api.africastalking.com` (prod) / `api.sandbox.africastalking.com` (sandbox) — backend calls only (SMS channel, regional aggregator for NG/GH/KE)
- Webhook destination : none (notifications are outbound-only ; no inbound webhook wired)

## Smart contract addresses (V2)

### Celo Sepolia testnet (current dev target)

Active deploy (post-H-1 redeploy, 2026-05-05, ADR-042). Predecessor
addresses retained in `docs/DEPLOYMENTS_HISTORY.md` and
`packages/contracts/deployments/celo-sepolia-v2.json`
`previous_deployments[]`.

| Contract | Address |
|---|---|
| MockUSDT V2 | `0xd34428140Fc8D6Be523d9A14C4E215F5709f9427` |
| EtaloReputation | `0x5762502acAA57744F0bC10b3f0fD2Cd59a16EFbE` |
| EtaloDispute | `0x1f830A47af07E2BE9Db2017C873Bd2eF7F98f4a1` |
| EtaloEscrow | `0xc8174b1218fEbD7d49B982cB3f1De83e411FbEA1` |
| EtaloCredits | `0x778a6bda524F4D396F9566c0dF131F76b0E15CA3` |
| EtaloStake (V2 deferred per ADR-041) | `0xE599a167f0422D6700EC812c6b0f3c485379Ed05` |
| EtaloVoting (V2 deferred per ADR-041) | `0x44E4Aafb22ac1Af3ea005EBa7384Fa310b6fA671` |

Treasury wallets (3 separated per ADR-024) :

| Wallet | Address |
|---|---|
| creditsTreasury | `0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA` |
| commissionTreasury | `0x9819c9E1b4F634784fd9A286240ecACd297823fa` |
| communityFund | `0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6` |

### Celo Mainnet (V1 production — LIVE)

Deployed 2026-05-25 (`v1.4-mainnet`), owned by the 2-of-3 Safe
`0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F`. EtaloEscrow is the
ADR-057 redeploy (canonical since the 2026-06-06 cutover ; the old
escrow `0x0890D9bCE4E71148b135A99Cf501DE52Aa05Ee92` is retained for
history only). Source of truth :
`packages/contracts/deployments/celo-mainnet-v2.json`.

| Contract | Address |
|---|---|
| USDT token (Celo native) | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` |
| USDT adapter (CIP-64 fee currency) | `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72` |
| EtaloReputation | `0xaF890609a3B2AF6E1E2Ebf91267347133b5065AD` |
| EtaloStake | `0x3D588192BC76e38a3f6453E45A9B9aD0Dc85bc9A` |
| EtaloVoting | `0xa1C48f2f962484D63D4D1b04C9c2574Da2C0EcBA` |
| EtaloDispute | `0x6d5Aa5e0EAE407688E99492213849D9a608D63d2` |
| EtaloEscrow (canonical, ADR-057) | `0x44E4Aafb22ac1Af3ea005EBa7384Fa310b6fA671` |
| EtaloCredits (redeploy 2026-06-15, creditsTreasury=Safe) | `0x6DF4a45886D4972C388413cCABe9B724A73560E8` |
| EtaloBoutiqueBilling (ADR-059, one-time 1 USDT fee) | `0x67764186d69A9871ab4F5f3fA7Ba3d8d6dE230e7` |

> Retired (history only, do not call) : old EtaloEscrow
> `0x0890D9bCE4E71148b135A99Cf501DE52Aa05Ee92` (pre-ADR-057) and old
> EtaloCredits `0xDDbE5BEC28B4eC0a309fca87047750EF4b42F7d6`
> (creditsTreasury was a non-Safe EOA) — see
> `deployments/celo-mainnet-v2.json` `previous_deployments[]`.

## External assets / fonts / CDN

- Fonts : `next/font/local` self-hosted (Switzer Variable woff2 + Italic, served from `/fonts/switzer/`). No external font CDN at runtime.
- Images : Pinata IPFS only for user-generated content (product photos, shop logos). SVG illustrations bundled in `public/illustrations/v5/` (no external image CDN).
- Icons : `@phosphor-icons/react` package, all icons rendered locally (no CDN).

## Audit checklist (pre-submission)

> **Verification reset (2026-05-05)** : the V2 contract suite was
> redeployed on Celo Sepolia post-H-1 fix per ADR-042 (see
> `docs/DEPLOYMENTS_HISTORY.md`). The 6 hot-path surface checks below
> must be re-run against the new addresses before MiniPay submission ;
> any verification done before 2026-05-05 referenced the now-deprecated
> deploy and is invalidated.
- [ ] Toutes les origines listées vérifiées via DevTools Network panel sur les 6 surfaces hot-path : `/`, `/marketplace`, `/[handle]`, `/[handle]/[slug]`, `/checkout`, `/seller/dashboard`
- [ ] FastAPI endpoints enumerated exhaustively from `/api/openapi.json` (replace placeholder list above with full set)
- [ ] Aucun tracker tiers non documenté (verify zero analytics, zero pixel trackers, zero CDN font fetches)
- [ ] Production URL `etalo.xyz` resolves and serves the same bundle as the staging audit
- [x] All `*.etalo.xyz` subdomains documented (confirmed **unused** — no subdomains in V1; no `*.etalo.app` runtime targets)
- [x] Notification webhook destination — **none** (notifications are outbound-only: Twilio WhatsApp + Africa's Talking SMS; no inbound webhook)
- [x] Mainnet contract addresses filled in (LIVE — see Celo Mainnet table above ; incl. ADR-059 EtaloBoutiqueBilling + redeployed EtaloCredits)
- [x] PageSpeed Insights score captured for production URL (mobile) — Performance **95** (2026-06-10, see `docs/PRE_MAINNET_QA.md`)
- [ ] DevTools Network panel snapshot saved (HAR file or screenshots) for each of the 6 surfaces
- [ ] Sample tx Celoscan per method (structure ready, 25/40 V1-active entries populated, 15 pending FU-J11-004 smoke E2E) → see `docs/audit/SAMPLE_TXS.md`

## Cross-references

- `docs/AUDIT_CELOPEDIA_ALIGN.md` (commit `9e2a15e`) §B "network manifest" gap promoted BLOCKING
- `CLAUDE.md` inner Tech stack section + Key addresses (Celo mainnet + Celo Sepolia)
- `packages/contracts/deployments/celo-sepolia-v2.json` (canonical V2 addresses + tx hashes)
- `packages/web/next.config.mjs` images remotePatterns
- `packages/web/.env.example` for the env var contract surface
- `docs/audit/SAMPLE_TXS.md` (sample transactions per V2 method, listing prereq §3)
- `docs/CELOSCAN_VERIFICATION.md` (source-verification status, listing prereq §2)
- `docs/audit/lighthouse/README.md` (PageSpeed mobile baseline, listing prereq §4)
