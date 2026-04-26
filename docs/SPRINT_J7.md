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
