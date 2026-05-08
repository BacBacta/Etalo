# Etalo Web — MiniPay-first Next.js App

Single Next.js 14 App Router app powering the three Etalo pillars (per ADR-035) :

- **Public marketplace + per-seller boutique** at `etalo.app` and `etalo.app/[handle]` (SSR, SEO-ready, social-share OpenGraph cards)
- **MiniPay seller dashboard** at `etalo.app/seller/dashboard` (client-side, wagmi + viem against Celo)
- **Buyer checkout flow** with USDT escrow at `etalo.app/checkout`

Predecessor `packages/miniapp/` (Vite) is deprecated by ADR-035 — this is the unified web surface for both public visitors and MiniPay WebView users (detection via `window.ethereum?.isMiniPay`).

## Dev workflow

Use the canonical one-command launcher (3 Windows Terminal tabs : Backend + Frontend + ngrok) :

```powershell
C:\Users\Oxfam\projects\etalo\Etalo\packages\web\scripts\etalo-dev-all.ps1
```

See [`scripts/README.md`](./scripts/README.md) for the full launcher matrix (alternatives, aliases, ngrok URL capture helpers).

Or run scripts directly :

```bash
pnpm install
pnpm dev      # Next.js dev server on :3000
pnpm test     # Vitest 295 PASS
pnpm lint     # next lint (ESLint)
pnpm build    # production bundle
```

## Tests

295 specs across 38 test files (Vitest + jsdom + @testing-library/react). Run all : `pnpm test`. Watch mode : `pnpm test:watch`.

CI runs typecheck + lint + tests on every push to `main` / `feat/**` and every PR — see [`../../.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## Architecture

- `src/app/` — App Router pages (server + client components)
- `src/components/` — Shared React components
- `src/components/ui/v4/` + `src/components/ui/v5/` — Design System (V4 = Phase 2-3, V5 = Phase 3-5 Robinhood-target)
- `src/hooks/` — TanStack Query data hooks (5 consumers : credits, marketplace, analytics, etc.)
- `src/lib/` — Utility libs (formatters in `lib/usdt.ts` + `lib/format.ts`, API wrappers in `lib/api.ts` + `lib/seller-api.ts`, IPFS gateway, MiniPay detection)

## Vercel deploy

Single-tenant deploy : Vercel hosts only this package (`packages/web`).
The FastAPI backend (`packages/backend`) and Hardhat contracts
(`packages/contracts`) are NOT deployed to Vercel — backend goes to a
long-running host (Render / Fly.io recommended) and contracts ship via
Hardhat.

Region pinned to `cpt1` (Cape Town) via [`vercel.json`](./vercel.json)
for V1 markets latency (NG / GH / KE / ZA, see ADR-041).

### First-time setup (CLI)

```bash
# From repo root :
vercel login
vercel link
#   → "Set up and deploy" : Y
#   → "In which directory is your code located?" : packages/web
#   → Framework auto-detected : Next.js
```

### Required environment variables

Set via `vercel env add <NAME> production` (also `preview` if needed)
or in the Vercel dashboard → Project → Settings → Environment Variables.
All values currently target Celo Sepolia testnet — flip to mainnet at
sprint J12 (mainnet deploy).

| Variable | Value (V2 Sepolia) |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL + `/api/v1` (e.g. `https://api.etalo.app/api/v1`) |
| `NEXT_PUBLIC_BASE_URL` | `https://etalo.app` (production) |
| `NEXT_PUBLIC_CELO_RPC_URL` | `https://celo-sepolia.drpc.org` |
| `NEXT_PUBLIC_CHAIN_ID` | `11142220` |
| `NEXT_PUBLIC_USDT_ADDRESS` | `0xea07db5d3D7576864ac434133abFE0E815735300` |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | `0xAeC58270973A973e3FF4913602Db1b5c98894640` |
| `NEXT_PUBLIC_DISPUTE_ADDRESS` | `0xEe8339b29F54bd29d68E061c4212c8b202760F5b` |
| `NEXT_PUBLIC_STAKE_ADDRESS` | `0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB` |
| `NEXT_PUBLIC_REPUTATION_ADDRESS` | `0x539e0d44c0773504075E1B00f25A99ED70258178` |
| `NEXT_PUBLIC_VOTING_ADDRESS` | `0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A` |
| `NEXT_PUBLIC_CREDITS_ADDRESS` | `0x778a6bda524F4D396F9566c0dF131F76b0E15CA3` |

Do NOT set `LOCAL_API_REWRITE_TARGET`, `NEXT_PUBLIC_FORCE_MINIPAY`, or
`NEXT_PUBLIC_DEBUG_MINIPAY` in production — these are dev-only flags
(see `.env.example`).

### Deploy

```bash
vercel --prod        # production deploy to etalo.app
vercel               # preview deploy (auto-aliased branch URL)
```

Custom domain `etalo.app` : configure in Vercel dashboard →
Domains, then update DNS (Vercel provides the records).

## Pointers

- Repo root [README](../../README.md) — project overview + tech stack + sprint status
- [`../../docs/SPRINT_J10_V5.md`](../../docs/SPRINT_J10_V5.md) — current sprint plan + Phase closures
- [`../../docs/DECISIONS.md`](../../docs/DECISIONS.md) — ADR log (ADR-035 single-app architecture, ADR-040 V5 design pivot, ADR-041 V1 scope intra-only)
- [`../../CLAUDE.md`](../../CLAUDE.md) — AI agent context + critical rules
