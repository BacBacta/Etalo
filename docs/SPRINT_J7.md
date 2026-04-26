# Sprint J7 — Asset Generator (V1 Boutique pillar 3)

**Sprint objective**: Deliver the asset generator feature that lets sellers
generate marketing images + captions for their products, monetized via the
credits system. V1 Boutique pillar 3 from CLAUDE.md and ADR-014.

**Architecture decisions**: see ADR-037 (Playwright + hybrid credits +
5 templates + EN/Swahili).

**Pricing model**: 0.15 USDT/credit, 5 free credits/month, 10 welcome
bonus on first SellerProfile. See `docs/PRICING_MODEL_CREDITS.md` and ADR-014.

**Estimation**: 8 blocks, ~3-4 weeks total.

---

## Block 1 — Foundations + ADR-037 + Playwright setup

- Branch `feat/asset-generator-v2` from main
- Update CLAUDE.md "Current sprint" → J7
- Add ADR-037 (architectural choices)
- Install Playwright Python + Chromium binary in `packages/backend`
- Create `app/services/asset_generator.py` skeleton (NotImplementedError stub)
- Test scaffolding placeholder

## Block 2 — Design 5 templates (HTML/CSS)

- Instagram Square 1080×1080 (feed posts)
- Instagram Story 1080×1920 (story/reel cover)
- WhatsApp Status 1080×1920 (WhatsApp green vibe)
- TikTok Cover 1080×1920 (trending vibe, neutral background)
- Facebook Feed 1200×630 (OG-style horizontal)
- Each template: HTML/CSS file in `packages/backend/app/services/asset_templates/`
- Slot variables: product image URL, title, price USDT, seller handle, QR URL

## Block 3 — Backend image generation pipeline

- Implement `asset_generator.py` real Playwright rendering
- POST `/api/v1/marketing/generate-image` endpoint
- IPFS pinning (Pinata, reuse pattern from Étape 8.1)
- E2E tests: 5 specs (1 happy path per template format)
- Dev fallback if Pinata creds missing (returns dummy hash for testing)

## Block 4 — Claude API caption generation

- New service `app/services/caption_generator.py` calls Claude API
- 2 languages V1: EN + Swahili
- Prompt engineering: marketing tone, hashtag-friendly, mobile-channel native
- POST `/api/v1/marketing/generate-caption` endpoint
- Sample generation for QA: 10 captions per language for review
- E2E tests: 4 specs (2 langs × 2 success/failure paths)

## Block 5 — EtaloCredits.sol smart contract

- New contract `packages/contracts/contracts/EtaloCredits.sol`
- Functions: `purchaseCredits(uint256 amount)`, `balanceOf(address)`, `setBackendOracle(address)` (admin)
- USDT pull via `transferFrom`, mint credits to caller
- Treasury: `creditsTreasury` (per ADR-024 — already wired Block 4 J4)
- Hardhat unit tests: 20+ specs
- Foundry invariant: total minted = total USDT pulled / 0.15
- Slither + 0 High / 0 Medium clean
- Deploy Sepolia + verify triple-explorer
- ADR-038 if any deviation from spec discovered

## Block 6 — Backend EtaloCredits integration

- New SQLAlchemy model `seller_credits_consumption` (off-chain ledger)
  - Fields: id, seller_id, image_id (FK new MarketingImage table), credits_consumed (1 default), created_at
- Indexer handler for `EtaloCredits.CreditsPurchased` event (mirror balance in DB cache)
- Service `credit_service.py`:
  - `get_balance(seller)` returns on-chain balance - off-chain consumed
  - `consume_credits(seller, amount=1)` writes to ledger, raises if insufficient
- Welcome bonus 10 credits: backend logic on first SellerProfile creation (no on-chain mint, ledger entry "bonus")
- 5 free/month: rolling reset based on `created_at` timestamps
- E2E tests: 5 specs

## Block 7 — Frontend Marketing tab UI

- Replace Marketing stub from J6 Étape 8.2 OverviewTab
- New `app/seller/dashboard/marketing/page.tsx` OR new `MarketingTab.tsx` in tabs
- Product picker (lists seller's active products)
- Template selector (5 cards with thumbnails)
- Caption preview (editable, AI-generated)
- "Generate marketing pack" button → consume 1 credit → backend pipeline
- Result: 1 image preview + 2 captions (EN + Swahili switchable)
- Download button (PNG)
- Share buttons (WhatsApp + Instagram intent links)
- "Buy more credits" UI (calls EtaloCredits.purchaseCredits via wallet)
- Vitest specs for credit math + button states

## Block 8 — E2E testing + smoke + closure

- Backend pytest cumulative: 47 J6 + Block 3 (5) + Block 4 (4) + Block 5 (20) + Block 6 (5) = ~80 specs
- Frontend vitest cumulative: 9 J6 + Block 7 (~5) = ~14 specs
- Smoke MiniPay: full marketing image generation flow
- Memory consolidation
- PR #4 → main + tag `v2.0.0-asset-generator-sepolia`

---

# Sprint J7 closure — bilan final

**Status**: ✅ COMPLET (2026-04-26)
**Branch**: `feat/asset-generator-v2`
**Tag**: `v2.0.0-asset-generator-sepolia`
**PR**: #4 (merged into `main`)

## Stats finales

| Metric | Value |
|---|---|
| Commits sur `feat/asset-generator-v2` | 14 (12 feat/test + 2 docs closure) |
| Files touched | 75 |
| LoC delta | +7,497 / −52 |
| Backend pytest e2e | **76/76 PASS** (was 67 pre-J7, +9 net) |
| Backend pytest unit | **39/39 PASS** (was 37 pre-J7, +2 net) |
| Contracts Hardhat unit | **168/168 PASS** (144 J4 + 24 J7 EtaloCredits) |
| Foundry invariant | **12,800 calls / 0 reverts / 0 discards** (treasury == sum × 150,000) |
| Slither (`EtaloCredits.sol`) | **0 H / 0 M / 0 L / 0 I** (101 detectors) |
| Frontend vitest | **35/35 PASS** (was 9 pre-J7, +26 net) |
| Sepolia txs (J7) | 2 (deploy + smoke purchase), ~0.003 CELO total |
| 6e contrat V2 deployed | EtaloCredits at `0xb201a5F0D471261383F8aFbF07a9dc6584C7B60d` |

## Block timeline

| Block | Commit | Subject |
|---|---|---|
| 1 (foundations) | `b40fe96` | foundations + ADR-037 + Playwright setup |
| 2 (templates) | `cb759ba` | 5 marketing templates HTML/CSS + smoke render script |
| dev script | `9e7e32f` | one-command dev environment startup script |
| dev fix | `5fcde7c` | etalo-dev.ps1 wt semicolon parsing bug |
| 3 (backend pipeline) | `bd6babf` | backend marketing image generation pipeline |
| 4 (Claude captions) | `3bcf6ac` | Claude API caption generation (EN + Swahili) |
| 5a (contract) | `6a7962c` | EtaloCredits.sol contract + 24 Hardhat unit tests |
| 5b (audit) | `51c1a8a` | EtaloCredits Foundry invariant + Slither clean |
| 5b (deploy) | `9f090de` | deploy EtaloCredits Sepolia + verify triple-explorer |
| 6 (backend integ) | `5fa8b6e` | backend EtaloCredits integration (indexer + ledger + service) |
| 7a (frontend UI) | `af9e4ba` | frontend Marketing tab core UI |
| 7b (buy flow) | `62fdde4` | buy-credits flow — wagmi USDT approve + purchaseCredits |
| 8 closure (security) | `6b8a00e` | docs(security): J7 EtaloCredits closure section |
| 8 closure (CLAUDE) | `f517efe` | docs: J7 closure — flip current sprint to J8 TBD |

## Lessons learned (#34–#43)

10 lessons distilled from J7 implementation, cross-cutting backend +
contracts + frontend + ops:

**#34 — Playwright + psycopg async event loop on Windows.** Backend
forces `WindowsSelectorEventLoopPolicy` for psycopg async, but
Playwright's transport spawns Chromium via `asyncio.create_subprocess`
which Selector loops can't do on Windows. Fix: run sync_playwright
in `asyncio.to_thread()` and temporarily swap to
`WindowsProactorEventLoopPolicy` for the duration of the render.
No-op on Linux production.

**#35 — SafeERC20 over raw `transferFrom` for new V2 contracts.**
Existing J4 contracts (Stake, Escrow) use raw `require(usdt.transferFrom(...))`.
That predates Etalo's SafeERC20 adoption. New contracts (EtaloCredits)
use `SafeERC20.safeTransferFrom` per ADR-007 USDT quirks. Don't copy
the legacy pattern into new code — it's a known migration debt, not
a target.

**#36 — viem v2 `getEvents.X` default `fromBlock` is "latest", not "earliest".**
Multi-tx tests that read events across blocks must pass
`{ fromBlock: 0n }` explicitly. Default behavior caches only the
latest block's events — silently missing historical events from the
same test session. Hardhat tests on EtaloCredits hit this on the
multi-buyer event tracking spec.

**#37 — Blockscout indexer lag on Celo Sepolia ~90s.** First verify
attempt right after deploy returns "Address is not a smart-contract"
because Blockscout's indexer hasn't ingested the deployment yet.
`hardhat verify` re-run after a brief wait succeeds. Etherscan +
Sourcify accept the verification immediately. Plan ~2 minutes of
slack between deploy and full triple-explorer verification.

**#38 — Hybrid credits architecture (ADR-037) keeps UX clean.**
On-chain purchase via `EtaloCredits.purchaseCredits` (1 tx, 1 wallet
prompt for the seller). Off-chain consumption ledger (1 row per
generated image, no tx, no wallet popup). Purchase emits
`CreditsPurchased`; the indexer mirrors it into the ledger as a
+credits row. Avoids the per-image wallet popup that an all-on-chain
design would force.

**#39 — `alembic --autogenerate` includes pre-existing schema drift.**
The autogenerate run for the J7 ledger tables also detected NOT NULL
adjustments on `users` columns and unique-constraint shape changes
on `seller_profiles` — none of which were the J7 feature. Strip the
migration to feature-only changes before committing; clean drift in
a separate dedicated migration to keep the audit trail readable.

**#40 — psycopg3 `_pg3_N already exists` on multi-session same-table inserts.**
psycopg3 caches prepared statements per connection by name. When
SQLAlchemy returns a connection to the pool mid-cache and a different
session reuses it with the same SQL shape, psycopg3 generates a
duplicate `_pg3_N` and the commit fails. Fix: pass
`connect_args={"prepare_threshold": None}` to `create_async_engine`.
SQLAlchemy's own statement cache covers the workload.

**#41 — `/generate-caption` is FREE (no credit charged).** Captions
are cheap to regenerate via Claude (~$0.005 / call) and the seller
might want to switch language or tone after the image is generated.
The cost lever is the Playwright render + IPFS pin (`/generate-image`).
Block 7a's GeneratedAssets caches captions client-side per language
to avoid even the free regen call when the user toggles back.

**#42 — `tsconfig.json` without explicit `target` rejects BigInt literals.**
The default target is below ES2020, so `150_000n` doesn't compile
even though `lib: esnext` is set. Either add `target: "ES2020"`
(ratified) or use `BigInt(150_000)` everywhere. Block 7b runtime
code uses `BigInt(...)`; tests use literals (compiled by vitest's
swc with a modern target).

**#43 — Read `process.env.X` lazily inside functions, not at module
scope.** Vitest's `vi.stubEnv` only takes effect after the test
file's module imports run. Hooks/services that capture env vars at
module scope freeze the unstubbed value — tests then trip
"Contract addresses not configured" branches that prod never hits.
Fix: read `process.env.NEXT_PUBLIC_X` inside the action function.
Trivial perf cost, big testability win.

(Earlier lessons #1–#33 from prior sprints remain in the user's
auto-memory and project decision log.)

## Sign-off

J7 closes V1 Boutique pillar 3 (asset generator). Sprint J7 PR (#4)
merged into `main`. Tagged `v2.0.0-asset-generator-sepolia` for the
`main` commit immediately after the merge.

The 6-contract V2 stack on Celo Sepolia is now feature-complete for
V1 Boutique launch:
**MockUSDT + EtaloReputation + EtaloStake + EtaloVoting + EtaloDispute
+ EtaloEscrow + EtaloCredits**.

Next sprint (J8) TBD post-Proof of Ship submission.
