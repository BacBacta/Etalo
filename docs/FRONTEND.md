# Etalo — Frontend Technical Reference

Two frontend packages:

- `packages/miniapp/` — the interactive Mini App that runs inside
  MiniPay's WebView. SPA, client-side rendering, Wagmi for on-chain
  actions.
- `packages/web/` — public product pages. Next.js 14 App Router,
  server-rendered for SEO and social sharing, no wallet logic.

---

## Mini App routes (`packages/miniapp`)

Single-page app; React Router v6. `RequireWallet` renders `null`
while connection is in flight (no "Connecting…" text per CLAUDE.md).

| Path                    | Guard(s)                                | Purpose                                      |
|-------------------------|-----------------------------------------|----------------------------------------------|
| `/`                     | —                                       | Landing. CTA label switches silently based on `useMinipay()` state: `Open my shop` when connected with profile, `Get started` inside MiniPay, `Open in MiniPay` on desktop. |
| `/onboarding?step=1..3` | `RequireWallet`                         | 3-step onboarding. URL step param is the canonical source — browser Back works naturally. `localStorage` draft saved at every step transition, hydrated silently on mount, cleared on success. |
| `/seller`               | `RequireWallet` + `RequireSellerProfile`| Dashboard with 6 cards (revenue sparkline, active orders, escrow, top products, reputation, notifications). Refresh button invalidates the analytics and notifications React Query keys. |
| `/checkout/:productId`  | `RequireWallet`                         | Buyer flow. Reaches here from the web Buy CTA. State machine drives the 3-tx sequence. |
| `/order/:orderId`       | `RequireWallet`                         | Post-purchase recap. Status badge, amount + commission, on-chain ID, explorer link. |
| `/404`                  | —                                       | Not found. Any unmatched path redirects here. |

## Web routes (`packages/web`)

App Router file-based; all routes are SSR with `generateMetadata`
producing OpenGraph + Twitter Card meta.

| Path                | Source                                   | Purpose                                    |
|---------------------|------------------------------------------|--------------------------------------------|
| `/`                 | `src/app/page.tsx`                       | Minimal landing + "Open in MiniPay" CTA.   |
| `/[handle]/[slug]`  | `src/app/[handle]/[slug]/page.tsx`       | Public product page. Hero image, title, USDT price, stock, description, Buy button, WhatsApp + copy-link share. `notFound()` on 404 from backend. |
| `/*`                | `src/app/not-found.tsx`                  | 404 with a "Back to Etalo" link.           |

---

## Key hooks (`packages/miniapp/src/hooks`)

| Hook                      | What it does                                                                                           | Key React Query options                     |
|---------------------------|--------------------------------------------------------------------------------------------------------|---------------------------------------------|
| `useMinipay()`            | Detects `window.ethereum.isMiniPay`, auto-connects silently on mount, exposes `{ isInMinipay, address, isConnected, isConnecting }`. | —                                           |
| `useSellerProfile()`      | `GET /api/v1/sellers/me`. Returns `{ profile: SellerProfile }` or `{ profile: null }` — the null path drives the redirect to `/onboarding`. | `staleTime: 60_000`, enabled when connected |
| `useAnalyticsSummary()`   | `GET /api/v1/analytics/summary` — powers 5 of the 6 dashboard cards (Revenue, ActiveOrders, Escrow, TopProducts, Reputation). | `staleTime: 60_000`                         |
| `useNotifications(limit)` | `GET /api/v1/notifications?limit=N` — NotificationsCard.                                               | `staleTime: 60_000`                         |
| `useHandleAvailability()` | Debounced 400 ms `GET /api/v1/sellers/handle-available/{handle}` used by the onboarding Step 2 input to show an inline check / X / spinner. | `staleTime: 30_000`                         |
| `useIpfsUpload()`         | `useMutation` that POSTs a `FormData` to `/api/v1/uploads/ipfs`, 5 MB client-side guard.               | —                                           |
| `useOrderInitiate(id)`    | `POST /api/v1/orders/initiate` — fetches every param needed for the on-chain checkout.                 | `staleTime: 0` (fresh at each mount), `retry: 0` |
| `useCheckout()`           | The checkout orchestrator. Exposes `{ state, run({productId, initiate}), reset }` — see *Checkout flow* below. | n/a (hand-rolled state machine)             |

## Key shared components (`packages/miniapp/src/components`)

- **`ShopHandle`** — single source of truth for rendering a seller
  identity. Always outputs `Shop Name @handle` (prefix `@` added
  automatically if missing). Never accepts a wallet address. This
  component enforces the "no 0x… in UI" rule at the component boundary.
- **`IpfsImageUpload`** — two flavours exported:
  - `IpfsLogoUpload` (single tile, shop logo)
  - `IpfsPhotosUpload` (grid up to 5, product photos)
  Each slot tracks `pending | uploaded | error` with a local
  `createObjectURL()` preview during upload + gateway URL after success.
  Inline retry button on error.
- **`MobileLayout`** — `header` + scrollable content + `bottomCta`
  slots; caps to `max-w-md` on wide screens; `pt-safe` / `pb-safe`
  utilities use `env(safe-area-inset-*)`.
- **`CheckoutStepIndicator`** (under `components/checkout/`) — "Step
  n of total" with a bulleted list; active step shows a spinner,
  done steps show a green check. Distinct from the onboarding
  `StepIndicator` below.
- **`StepIndicator`** (under `components/shared/`) — 3 dots used by
  the onboarding flow; the current dot elongates into a pill.
- **`CheckoutSummary`** — pre-confirm recap card. Renders ShopHandle,
  USDT-formatted price, payment label ("Stablecoin"), network fee
  placeholder ("~$0.01"), auto-release window ("7 days" or "3 days").

---

## Checkout flow (detailed)

### State machine (`useCheckout()`)

```
          run()
  idle ──────────▶ preparing ──▶ confirming (step 1..N) ──▶ success
                     │                   │
                     └──── error ◀───────┘
```

`CheckoutState` union:

```ts
| { phase: "idle" }
| { phase: "preparing" }
| { phase: "confirming"; step: "approve" | "create" | "fund";
    stepNumber: 1 | 2 | 3; totalSteps: 2 | 3 }
| { phase: "success"; onchainOrderId; dbOrderId;
    txHashCreate; txHashFund }
| { phase: "error"; error: CheckoutError }
```

CLAUDE.md rule 8 (four transaction states: Preparing / Confirming /
Success / Error) is respected — `idle` is the pre-click UI state, not
a transaction state, so it doesn't count against the four.

### On-chain sequence

1. **Read allowance** (no tx) — `USDT.allowance(buyer, escrow)`.
2. **`USDT.approve(escrow, amountRaw)`** — **skipped** when the
   current allowance already covers `amountRaw`. Forced legacy tx
   (`type: 'legacy'` via `asLegacyTx()`).
3. **`EtaloEscrow.createOrder(seller, amountRaw, isCrossBorder)`** —
   the backend is authoritative on `isCrossBorder`. Emits
   `OrderCreated(orderId, buyer, seller, amount, isCrossBorder)`; we
   parse `orderId` from the receipt logs via
   `parseOrderCreatedFromReceipt`.
4. **`EtaloEscrow.fundOrder(orderId)`** — pulls USDT from buyer via
   `transferFrom`. Emits `OrderFunded(orderId, amount)`.
5. **`POST /api/v1/orders/confirm`** with both tx hashes + derived
   `amount_raw` + `is_cross_border`. Backend writes the DB `Order`
   and a `Notification` row (`sent=false`) for the seller.
6. `queryClient.invalidateQueries(['analytics'])` so the seller's
   dashboard reflects the new order without polling.

### Confirmations + timeout

- `confirmations: 1` on Celo Sepolia — to be bumped to 2-3 before
  mainnet (see `docs/DECISIONS.md`).
- `timeout: 90_000` ms per tx. Timeouts raise
  `WaitForTransactionReceiptTimeoutError`, mapped by
  `classifyCheckoutError` to `{ code: "timeout" }` with a message
  pointing the user to the Blockscout explorer.

### Error taxonomy (`lib/checkout-errors.ts`)

| Code                      | Cause (viem error walked from chain)                                        |
|---------------------------|-----------------------------------------------------------------------------|
| `user_rejected`           | `UserRejectedRequestError`                                                  |
| `insufficient_usdt`       | `ContractFunctionRevertedError` with `errorName === "ERC20InsufficientBalance"` |
| `insufficient_allowance`  | `ContractFunctionRevertedError` with `errorName === "ERC20InsufficientAllowance"` |
| `contract_revert`         | Any other `ContractFunctionRevertedError`                                   |
| `timeout`                 | `WaitForTransactionReceiptTimeoutError`                                     |
| `network`                 | `TransactionExecutionError` without a revert cause                          |
| `unknown`                 | Anything else                                                               |

### Reference transactions

The exact 3-tx sequence was executed against the deployed contracts
in `packages/contracts/scripts/e2e-checkout.ts`.

| Step                 | Contract           | Tx hash / explorer                                                                                                                    |
|----------------------|--------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| `MockUSDT.mint`      | `0x4212d2…a12dc6`  | [0xc9787100](https://celo-sepolia.blockscout.com/tx/0xc9787100ed6fc4b14ce030fa7f2666706878b667f6dd8574d80fa9bfb820c89b)               |
| `USDT.approve`       | `0x4212d2…a12dc6`  | [0x5bb8772a](https://celo-sepolia.blockscout.com/tx/0x5bb8772ad520a2de6eba8c48158ca8dadbbe021bb7efd4d1afc71610a9ca8278)               |
| `Escrow.createOrder` | `0x652e02…96cb455` | [0xd551efbc](https://celo-sepolia.blockscout.com/tx/0xd551efbc10c6c15f1b0761eeb73677ae4e4e94a7f24e3da4cd76221bda9af7aa)               |
| `Escrow.fundOrder`   | `0x652e02…96cb455` | [0x0deac847](https://celo-sepolia.blockscout.com/tx/0x0deac8478de90ed274169981d0d319248a2d939130278321c9dd862de52d9cba)               |

---

## Design standards applied (CLAUDE.md)

- **Mobile-first viewport** — 360 × 720 minimum. `index.html`'s
  `viewport` meta includes `viewport-fit=cover, user-scalable=no`.
- **Single column** — `max-w-md mx-auto` in `MobileLayout`; no
  horizontal scroll at 360 px width.
- **Touch targets ≥ 44 × 44 px** — enforced globally in
  `src/index.css` for `button`, `[role="button"]`, `a`; `Button`
  primitive `size: default` is `h-11` (44 px).
- **Body text ≥ 16 px** — `body { font-size: 16px }` in
  `src/index.css`, and the same applies to the `Input` / `Textarea`
  shadcn primitives (`text-base` = 16 px).
- **Safe areas** — `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`
  utilities defined in `index.css` using `env(safe-area-inset-*)`.
  `MobileLayout` applies them to its header and bottom-CTA slots.
- **Centralized terminology** — `src/lib/terminology.ts` exports
  `NETWORK_FEE_LABEL`, `DEPOSIT_LABEL`, `WITHDRAW_LABEL`,
  `STABLECOIN_LABEL`, `DIGITAL_DOLLAR_LABEL`, `TX_STATES`. UI code
  imports these constants rather than hardcoding strings so forbidden
  words ("gas", "crypto", "token") can't leak in via a typo.
- **No wallet address in the UI** — `ShopHandle` is the only sanctioned
  component for rendering a seller identity; raw `address` fields are
  passed between modules internally (for contract calls) and
  **never** end up in a `{address}` JSX expression. `Landing`,
  `SellerHome`, `CheckoutSummary` and `Order` were audited.
- **Silent connection** — `useMinipay()` runs auto-connect in a
  `useEffect`; no "Connecting…" or "Connected" text is rendered.
  Guards render `null` during `isConnecting` / `isPending`.
- **Four transaction states** — `Preparing` / `Confirming` /
  `Success` / `Error` exposed by `useCheckout()`. Sub-step labels
  ("Step 1 of 3: Approving USDT spending") are descriptive text, not
  additional states.
- **USDT 6 decimals everywhere** — `lib/usdt.ts` centralizes
  `parseUsdt`, `formatUsdt`, `displayUsdt`. Amounts move between
  frontend and backend as decimal strings; on-chain math uses `bigint`.
- **WCAG AA contrast** — shadcn slate palette defaults satisfy 4.5:1
  on body text and 3:1 on large text.
