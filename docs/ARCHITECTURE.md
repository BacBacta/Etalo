# Etalo — Architecture

## Component Responsibilities

### Smart Contracts (Celo L2)

- **EtaloEscrow** — Holds USDT during transactions. Manages order lifecycle: create, fund, ship, confirm, auto-release. Handles cross-border 4-milestone progressive release. Collects commissions (1.8% intra / 2.7% cross-border) to treasury.
- **EtaloDispute** — 3-level dispute resolution linked to Escrow. L1: 48h seller negotiation. L2: community mediator. L3: admin final decision. Freezes auto-release on dispute.
- **EtaloReputation** — On-chain reputation scoring (0-100). Tracks completed orders, disputes won/lost. Grants Top Seller status (20+ orders, score 80+) which reduces auto-release from 3 days to 2.

### Backend (FastAPI)

- **Auth** — Wallet-based authentication via EIP-191 signature verification. Issues JWT tokens.
- **Products** — CRUD for seller product listings. Metadata stored in PostgreSQL, images on IPFS (Pinata).
- **Orders** — Off-chain order management linked to on-chain escrow via `onchain_order_id`.
- **Disputes** — Off-chain dispute metadata (photos, conversation logs) complementing on-chain resolution.
- **Analytics** — Denormalized daily snapshots per seller for dashboard performance.
- **Notifications** — WhatsApp messages via Twilio for order updates, dispute alerts.

### Mini App (React + MiniPay)

- Runs inside Opera MiniPay browser on mobile.
- Connects to user's Celo wallet via Wagmi/Viem.
- All transactions use legacy type (no EIP-1559) for MiniPay compatibility.
- Mobile-first: 360x720 minimum viewport, 44px touch targets.

### Public Web (Next.js SSR)

- SEO-optimized product pages accessible without wallet.
- Server-side rendered for social media link previews.
- "Buy on MiniPay" CTA redirects to Mini App.

## Data Flow

### Purchase Flow

```
Buyer (MiniPay)
  │
  ├── 1. Browse products (Backend API)
  ├── 2. Create order (Backend → saves to DB)
  ├── 3. Fund order (MiniPay → EtaloEscrow.createOrder + fundOrder)
  ├── 4. Seller ships (Backend updates, seller calls markShipped)
  ├── 5. Buyer confirms OR auto-release after deadline
  └── 6. Funds released to seller (minus commission to treasury)
```

### Dispute Flow

```
Buyer opens dispute
  │
  ├── L1: 48h for seller to resolve (full refund)
  ├── L2: Community mediator assigned (partial refund possible)
  └── L3: Admin final decision (any split)
```

## Security Model

- **Non-custodial**: Etalo never holds private keys. All fund movements are user-signed transactions.
- **Escrow protection**: USDT locked in smart contract until delivery confirmed or auto-released.
- **ReentrancyGuard**: All fund-moving functions protected against reentrancy attacks.
- **Admin powers**: Force refund, dispute resolution, seller sanctions. Admin actions logged in `audit_logs`.
- **No raw addresses in UI**: Users see shop handles and names, never 0x addresses.

## Infrastructure

| Service | Provider | Purpose |
|---|---|---|
| Blockchain | Celo L2 (OP Stack) | Smart contracts, USDT payments |
| Database | Fly Postgres (prod) / Docker Postgres 16 (local dev) | User data, orders, products |
| Cache | Upstash (Redis) | Sessions, rate limiting |
| IPFS | Pinata | Product images, metadata |
| Notifications | Twilio | WhatsApp order updates |
| RPC | dRPC / Forno | Celo node access |
