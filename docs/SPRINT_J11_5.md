# Sprint J11.5 — Buyer Interface MVP

**Status** : Planned, awaits Mike kickoff after J11 BLOCKING #3 closure
**Tracking ADR** : ADR-043
**Estimated effort** : ~40-50h (5-7 working days)
**Depends on** : J11 BLOCKING items closed, FU-J11-004 smoke E2E partly
combined into Block 8 below
**Unblocks** : J12 mainnet deploy + listing submission

---

## Sprint goals

1. Ship a buyer-facing order list + detail interface that closes the
   UX gap identified in ADR-043
2. Combine smoke E2E coverage (FU-J11-004) into the development cycle
   to fill `docs/audit/SAMPLE_TXS.md` TBD entries naturally
3. Maintain V1 launch readiness with no contract changes, no new ADRs
   beyond ADR-043

---

## Block 1 — Backend `GET /api/v1/orders` endpoint (~4h)

**Owner** : Mike
**File location** : `packages/backend/app/routers/orders.py` (extend if
exists, or create new router)

**Spec**
- Query param : `buyer=<wallet_address>`
- Optional pagination : `?limit=20&offset=0` (offset/limit kept over
  cursor — V1 buyer order volume is bounded by `MAX_TVL = 50K USDT`
  per ADR-026, cursor cost not justified at this scale)
- Reads from indexer events table (`onchain_events`)
- Returns ordered list (most recent first), with derived status enum
- Privacy : returns only orders where `buyer == query param` (no fishing)

**Response shape**
```json
{
  "items": [
    {
      "order_id": "0x...",
      "buyer": "0x...",
      "seller_handle": "smoke_b2",
      "seller_address": "0x...",
      "total_usdt_raw": "5000000",
      "items_count": 1,
      "status": "shipped",
      "created_at": "2026-05-XXTXX:XX:XXZ",
      "funded_at": "...",
      "shipped_at": "...",
      "auto_release_at": "...",
      "completed_at": null,
      "disputed": false
    }
  ],
  "count": 1,
  "limit": 20,
  "offset": 0
}
```

**Test cases**
- Empty list (new buyer wallet)
- Multiple statuses mixed
- Pagination boundary
- Buyer with 0 orders returns empty array, not 404

**Acceptance** : pytest unit + integration green

---

## Block 2 — Backend `GET /api/v1/orders/{order_id}` endpoint (~3h)

**Owner** : Mike
**File location** : same router as Block 1

**Spec**
- Permission : caller must be `order.buyer` OR `order.seller`. Otherwise 404
  (not 403, to avoid order-id enumeration leak)
- **Privacy : casual filter via `?caller=<addr>` query param. Stronger
  privacy graduation deferred V1.5+ (FU-J11-005). Note : SIWE is NOT a
  viable graduation option in the MiniPay context — see ADR-043 Threat
  model section. This filter protects against API-level casual
  enumeration but NOT against on-chain attackers who can reconstruct
  orders from EtaloEscrow events.**
- Returns full order state including :
  - Items breakdown (each with state)
  - Dispute history if any (open / N1 / N2 / N3 transitions)
  - Escrow contract address (clickable Blockscout link client-side)
  - Auto-release timestamp + countdown computed server-side
  - Eligible actions (`can_confirm_delivery`, `can_open_dispute`,
    `can_cancel`) — derived from contract state + business rules

**Test cases**
- Valid buyer access → full detail
- Wrong wallet address → 404
- Order not found → 404
- Order with dispute → dispute_history populated
- Order auto-release elapsed → eligible_actions reflects state

**Acceptance** : pytest green + 100% privacy guard coverage

---

## Block 3 — Frontend `/orders` route (~8h)

**Owner** : Mike
**File location** : `packages/web/src/app/orders/page.tsx`

**Components to create**
- `OrderListPage` (Server Component or Client Component depending on
  data fetching strategy — likely Client because needs wagmi
  `useAccount`)
- `OrderCard` (one row per order : seller handle, total, status badge,
  date, click → detail)
- `OrderStatusBadge` (visual badge per status enum, color-coded WCAG AA)
- `OrdersEmptyState` ("Aucune commande pour le moment / No orders yet")
- `OrdersLoadingState` (skeleton, mobile-friendly)

**Behavior**
- On mount : `useAccount` → if connected, fetch
  `/api/v1/orders?buyer=<address>`
- On disconnect : show "Connect wallet to see your orders" CTA
- Mobile-first 360×640, touch targets ≥ 44px, body 16px+
- English-only V1 (i18n deferred V1.5+ per FU-J11-006 ; markets
  NG / GH / KE / ZA primary are English-first per CLAUDE.md /
  ADR-041)
- Comply with CLAUDE.md rule 4 (no "crypto" / "gas" — use "stablecoin"
  / "network fee")
- Comply with CLAUDE.md rule 5 (no raw `0x...` in UI — use seller
  handle, order short id, or local nickname)

**Test cases**
- Empty state renders correctly
- Loading state renders correctly
- Multiple orders render correctly with status badges
- Click on OrderCard navigates to `/orders/[id]`
- Disconnected wallet shows connect CTA

**Acceptance** : vitest tests pass, lint clean, tsc clean

---

## Block 4 — Frontend `/orders/[id]` route (~10h)

**Owner** : Mike
**File location** : `packages/web/src/app/orders/[id]/page.tsx`

**Components to create**
- `OrderDetailPage`
- `OrderDetailHeader` (status badge, total, seller link)
- `OrderItemsList` (per-item state, sub-actions if applicable)
- `AutoReleaseTimer` (countdown, refresh every minute, "Auto-release in
  47h 23m")
- `OrderActionButtons` (conditional rendering based on
  `eligible_actions` from API)
  - `ConfirmDeliveryButton` → triggers `EtaloEscrow.confirmItemDelivery`
  - `OpenDisputeButton` → triggers `EtaloDispute.openDispute`, opens
    confirmation modal with brief explainer
  - `ViewOnBlockscoutButton` → external link to escrow tx
- `OrderTransactionStates` (4 precise states per CLAUDE.md rule 8 :
  Preparing / Confirming / Success / Error)

**Behavior**
- Fetch `/api/v1/orders/{id}` on mount
- 404 → render "Order not found or you don't have permission" (no leak)
- Live timer updates every 60s
- Action buttons trigger wagmi `writeContract` with proper chain
  switching (rule 3 — legacy tx only)
- Post-action : refresh order state, show success state (rule 8)
- WhatsApp share button : "Share order status with seller via WhatsApp"
  (uses standard `https://wa.me/?text=...` deeplink)

**Test cases**
- Each status renders correct components
- Timer updates correctly
- Action buttons appear/disappear based on eligible_actions
- 404 state renders correctly
- Transaction state machine works for confirm + dispute

**Acceptance** : vitest tests pass, integration test for full state
machine

---

## Block 5 — Header navigation entry (~1h)

**Owner** : Mike
**File location** : `packages/web/src/components/layout/Header.tsx`
(or wherever the main nav lives)

**Spec**
- New menu entry "My orders" between existing items
- Visible only when `useAccount().isConnected === true`
- Active state highlight when on `/orders` or `/orders/[id]`
- Touch target ≥ 44×44 mobile, accessible label

**Test** : header renders correctly per connection state

---

## Block 6 — Visual polish + accessibility audit (~1h)

**Owner** : Mike

> **Scope update 2026-05-06** — i18n FR/EN was previously planned here
> but is deferred to V1.5+ (FU-J11-006). Rationale : V1 launch markets
> per CLAUDE.md (NG/GH/KE primary, ZA per ADR-041) are English-first ;
> francophone diaspora is secondary. Adding i18n piecemeal to /orders
> while the rest of the app is English-only creates inconsistency
> worse than the absence of i18n. A clean i18n graduation pass over
> the full app (next-intl + extraction) is the right approach when a
> francophone market is targeted (Senegal / Cameroun / CIV).

- Visual polish : status badge colors per state, smooth timer
  countdown, consistent spacing
- WCAG AA contrast check on all status colors (manual + axe-core
  scan if available)
- Keyboard navigation pass : all action buttons reachable via Tab,
  Enter activates, Esc dismisses transient states
- Mobile viewport sanity : 360 × 640, 44 px touch targets, body 16 px

---

## Block 7 — Backend WhatsApp deeplink composition (~45 min, minimal scope)

**Owner** : Mike
**File location** : `packages/backend/app/services/whatsapp.py`

> **Scope update 2026-05-06** — Recon revealed the WhatsApp service
> is a stub (28 LoC, no Twilio SDK wire-up, no call sites, zero
> existing tests). The brief originally assumed mature templates with
> `/[seller_handle]` URLs to update — that surface doesn't exist yet.
> Block 7 ships **deeplink composition** so the buyer interface MVP
> is reachable as soon as the rest of the wire-up lands. Twilio SDK
> + call sites + opt-out compliance + observability tracked as
> **FU-J11-007** (V1.5+). Rationale : compressing the full wire-up
> into J11.5's tail would surface security concerns (rate limits,
> Africa opt-out compliance, webhook signature verification, queue
> management) that deserve their own ADR + tests + observability —
> not a fold-in to a sprint focused on the buyer interface MVP.

**Spec (minimal scope shipped here)**
- Augment `send_order_notification` + `send_dispute_notification`
  with an `order_uuid` param.
- Compose deeplink `{frontend_base_url}/orders/{order_uuid}` and
  embed in the message body.
- Add `FRONTEND_BASE_URL` settings field, default `https://etalo.app`
  with `.env` override pattern documented.

**Out of scope (deferred FU-J11-007)**
- Twilio SDK actual `send_message` implementation.
- Call sites — wiring the indexer / dispute resolver to trigger
  notifications on on-chain events.
- 6-method refactor (funded / shipped / delivered / auto-release /
  dispute / refund) — held until call sites give each method a
  reason to exist.
- Opt-out compliance, rate limiting, retry/dead-letter queue,
  webhook signature verification.

**Test cases (5 specs)**
- `send_order_notification` composes `/orders/{uuid}` URL.
- `send_dispute_notification` composes `/orders/{uuid}` URL.
- `_compose_order_url` honors configured base (e.g. ngrok override).
- `_compose_order_url` strips trailing slash on base.
- Default config points at production (sanity).

---

## Block 8 — Smoke E2E pass + SAMPLE_TXS fill (~6h)

**Combines** : FU-J11-004 (smoke E2E) + dogfooding the new buyer
interface

**Owner** : Mike
**Pre-req** : Blocks 1-7 complete

**Smoke flow** (per FU-J11-004 §A-F structure)
- A. Happy path intra (createOrder → fund → ship → confirm)
- B. Cancellation pre-fund
- C. Dispute resolution (open + N1 amicable resolve)
- D. Permissionless triggers (skip if time-bound, document in
  SAMPLE_TXS notes)
- E. Admin (skip forceRefund 3-condition, exercise emergencyPause if
  acceptable)
- F. Credits purchase

**Dogfooding angle**
- After each on-chain action, verify the new `/orders` and
  `/orders/[id]` UI reflects the new state correctly
- Capture tx hashes and immediately fill `docs/audit/SAMPLE_TXS.md`
- Capture screenshots of buyer interface at each state for
  documentation / marketing

**Acceptance**
- 0 TBD entries in `SAMPLE_TXS.md` §1 (V1 user-facing)
- ≥ 80% TBD entries filled in §3 (V1 admin + permissionless ; some
  may remain due to time-bound or operational nature)
- Buyer interface validates correctly across the flow
- FU-J11-004 marked done in `FOLLOWUPS_J11.md`

---

## Block 9 — Tests, lint, typecheck, bundle delta (~4h)

**Owner** : Mike

- All vitest pass (~+30-50 new tests vs. current baseline 318)
- All pytest backend pass
- `pnpm lint` clean
- `pnpm tsc --noEmit` clean
- `pnpm build` successful, capture bundle delta vs. baseline 220 kB
  on /checkout, expect /orders < 240 kB First Load JS
- Lighthouse mobile baseline on `/orders` and `/orders/[id]` :
  target ≥ 80 perf in this sprint, perf optim FU-J11-003 owns the
  ≥ 90 push

---

## Block 10 — PR open, review, merge (~2h)

**Owner** : Mike
**Branch** : `feat/buyer-interface-mvp`

- Open PR against `main`
- Review focus : ADR-043 alignment, privacy guard on detail endpoint,
  no raw 0x in UI, transaction state machine completeness
- Merge with merge commit (preserve narrative across the 9 blocks)
- Tag `v1.1-buyer-interface-mvp` if you want a marker for J12 prep

---

## Cross-sprint impact

**Updates needed elsewhere when J11.5 ships :**

- `CLAUDE.md` :
  - Update inner section if it lists the V1 routes (add `/orders`,
    `/orders/[id]`)
  - No critical rule additions expected
- `docs/NETWORK_MANIFEST.md` :
  - Add `/orders` and `/orders/[id]` to the 6 hot-path surfaces list
    if applicable for the next DevTools sweep
  - Audit checklist : tick "Sample tx Celoscan per method" once
    Block 8 fills SAMPLE_TXS
- `docs/SPEC_SMART_CONTRACT_V2.md` :
  - No contract changes, no spec change
- `docs/AUDIT_PRE_J11_SUMMARY.md` :
  - Add post-script note "Buyer interface MVP shipped J11.5
    (ADR-043), no security implications, no contract changes"
- `docs/FOLLOWUPS_J11.md` :
  - Mark FU-J11-004 done after Block 8
  - Mark FU-J11-003 (perf optim) as next priority for J11.5+
    cleanup sprint

---

## Risk register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Indexer doesn't yet index all required events for buyer view | Low | Validate Block 1 first, extend indexer scope if needed (still in J11 budget) |
| Mobile WhatsApp doesn't honor `/orders/[id]` deep-link out of MiniPay context | Medium | Test on real device early in Block 7, add fallback to web view |
| Bundle size on `/orders` blows past 240 kB | Low | Lazy-load heavy components, use Server Components where possible |
| Privacy leak on detail endpoint (order id enumeration) | Critical if happens | Block 2 acceptance criterion makes this non-negotiable |
| Sprint slip beyond 1 week delays J12 mainnet | Medium | Block 8 dogfooding doubles as smoke E2E, Block 10 review minimal scope. If slip, Block 6 (visual polish only post-i18n retire) absorbs further trim |

---

## Acceptance criteria for sprint closure

- [ ] Buyer can land on `/orders` and see all their orders by wallet
      address
- [ ] Buyer can click an order → see full state with timer + actions
- [ ] Header shows "Mes commandes" link when wallet connected
- [ ] Confirm delivery + open dispute flows work end-to-end on Sepolia
- [ ] WhatsApp notifications deep-link to `/orders/[id]`
- [ ] Privacy : wrong wallet 404s on detail endpoint (casual filter
      per ADR-043 Threat model — full auth deferred V1.5+ via FU-J11-005)
- [ ] Lighthouse mobile ≥ 80 perf on new routes
- [ ] All tests pass + 0 régression
- [ ] English-only V1 confirmed (i18n FR/EN graduation tracked as FU-J11-006 V1.5+)
- [ ] PR merged + ADR-043 referenced in commit messages
- [ ] FU-J11-004 closed via Block 8
- [ ] SAMPLE_TXS.md V1 user-facing section 0 TBD
