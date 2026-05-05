# Etalo Network Manifest

Required by MiniPay submission (minipay-requirements.md §2 : "provide a full manifest of every URL, subdomain, and origin your app calls"). MiniPay reviews this for supply-chain risk before listing.

This file is the canonical inventory of every network destination Etalo touches at runtime, along with the role and verification status. Each section MUST be empirically verified via DevTools Network panel on the 6 hot-path surfaces before submission (audit checklist at the bottom).

Last verified : `[date YYYY-MM-DD]`
Verifier : `[name]`
Submission target : Sprint J11 (MiniPay listing pre-submission)

## Domains & origins

### Production
- `etalo.app` — root domain, public funnel + MiniPay surface
- `*.etalo.app` — subdomains TBD (status / blog / docs)

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
- `POST /api/v1/onboarding` — atomic seller onboarding
- `GET /api/v1/notifications` — wallet notifications feed
- `GET /api/v1/analytics/summary` — seller dashboard aggregates
- `GET /api/v1/sitemap/data` — public sitemap data
- `GET /api/v1/credits/balance` — credits balance for asset generator
- `GET /api/v1/credits/ledger` — credits ledger entries
- `[other]` — to be enumerated exhaustively at submission time via FastAPI OpenAPI introspection (`/api/openapi.json`)

Backend exposed at the production URL TBD ; dev exposes via ngrok rewrite (`LOCAL_API_REWRITE_TARGET=http://localhost:8000` in `.env.local`).

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

- Twilio WhatsApp Business API : `api.twilio.com` (backend calls only)
- Webhook destination : TBD (Twilio Studio Flow or direct backend endpoint TBD per ADR)

## Smart contract addresses (V2)

### Celo Sepolia testnet (current dev target)

Active deploy (post-H-1 redeploy, 2026-05-05, ADR-042). Predecessor
addresses retained in `docs/DEPLOYMENTS_HISTORY.md` and
`packages/contracts/deployments/celo-sepolia-v2.json`
`previous_deployments[]`.

| Contract | Address |
|---|---|
| MockUSDT V2 | `0xea07db5d3D7576864ac434133abFE0E815735300` |
| EtaloReputation | `0x539e0d44c0773504075E1B00f25A99ED70258178` |
| EtaloDispute | `0xEe8339b29F54bd29d68E061c4212c8b202760F5b` |
| EtaloEscrow | `0xAeC58270973A973e3FF4913602Db1b5c98894640` |
| EtaloCredits | `0x778a6bda524F4D396F9566c0dF131F76b0E15CA3` |
| EtaloStake (V2 deferred per ADR-041) | `0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB` |
| EtaloVoting (V2 deferred per ADR-041) | `0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A` |

Treasury wallets (3 separated per ADR-024) :

| Wallet | Address |
|---|---|
| creditsTreasury | `0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA` |
| commissionTreasury | `0x9819c9E1b4F634784fd9A286240ecACd297823fa` |
| communityFund | `0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6` |

### Celo Mainnet (V1 production target Q2 2027)

| Contract | Address |
|---|---|
| USDT token (Celo native) | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` |
| USDT adapter (CIP-64 fee currency) | `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72` |
| Etalo contracts | TBD — deploy Sprint J12 mainnet launch |

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
- [ ] Production URL `etalo.app` resolves and serves the same bundle as the staging audit
- [ ] All `*.etalo.app` subdomains documented (or confirmed unused)
- [ ] Twilio webhook destination URL filled in
- [ ] Mainnet contract addresses filled in post Sprint J12 deploy
- [ ] PageSpeed Insights score captured for production URL (mobile, throttled 4G)
- [ ] DevTools Network panel snapshot saved (HAR file or screenshots) for each of the 6 surfaces

## Cross-references

- `docs/AUDIT_CELOPEDIA_ALIGN.md` (commit `9e2a15e`) §B "network manifest" gap promoted BLOCKING
- `CLAUDE.md` inner Tech stack section + Key addresses (Celo mainnet + Celo Sepolia)
- `packages/contracts/deployments/celo-sepolia-v2.json` (canonical V2 addresses + tx hashes)
- `packages/web/next.config.mjs` images remotePatterns
- `packages/web/.env.example` for the env var contract surface
