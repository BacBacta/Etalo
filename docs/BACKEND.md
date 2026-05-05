# Etalo V2 Backend

The V2 backend is a FastAPI application that mirrors on-chain state
from the Etalo V2 contracts on Celo Sepolia into a Postgres cache and
exposes it through a REST API. It does not custody funds or sign
transactions on behalf of users — its sole authority is reading
events and serving JSON.

**Status:** V2 backend deployed for Celo Sepolia indexing
(2026-04-25), pinned to contracts tag `v2.0.0-contracts-sepolia`.
Mainnet deployment is gated on the same audit phase as the contracts
(ADR-025).

For the contract reference, read `docs/SMART_CONTRACTS.md`. For the
ADRs that drove the V2 economics and architecture, read
`docs/DECISIONS.md`.

---

## Overview

The backend has three responsibilities:

1. **Indexer** — an asyncio task that polls `eth_getLogs` on the V2
   contracts every 30 seconds, decodes events into typed payloads,
   and writes/updates the Postgres mirror tables.
2. **Cache** — Postgres tables that are an eventually-consistent copy
   of on-chain state, indexed for the access patterns the frontend
   needs (list orders by buyer, list items by group, etc.).
3. **REST API** — FastAPI routes that read from the cache and, for
   the three POST endpoints, append off-chain metadata (delivery
   address, dispute photos, dispute messages) gated by EIP-191
   signed requests.

The pipeline:

```
Celo Sepolia ──► Indexer (30 s polling) ──► Postgres cache ──► FastAPI ──► JSON
```

The contracts are the source of truth. The cache exists for read
performance and to add off-chain context (delivery addresses, IPFS
hashes for dispute photos, conversation threads) that has no
on-chain representation.

### Stack

| Layer            | Library                                   |
|------------------|-------------------------------------------|
| Web framework    | FastAPI                                   |
| ORM              | SQLAlchemy 2.x async                      |
| DB driver        | psycopg 3 async (`postgresql+psycopg`)    |
| Migrations       | Alembic                                   |
| Web3             | web3.py 7.x — `AsyncWeb3` + `AsyncHTTPProvider` |
| Signature verify | `eth-account` (EIP-191 `personal_sign`)   |
| Tests            | pytest + pytest-asyncio + httpx ASGITransport |

---

## Setup

### Prerequisites

- Python 3.11+
- PostgreSQL 15+
- Alchemy API key (Celo Sepolia RPC) — drpc.org works as a fallback
  but Block 11 of Sprint J4 surfaced a multi-method outage that
  forced the switch.

### Environment variables

`.env` lives at `packages/backend/.env`. The relevant block for V2:

```
DATABASE_URL=postgresql://user:pass@host:5432/etalo

# RPC — Alchemy preferred, drpc fallback
CELO_SEPOLIA_RPC=https://celo-sepolia.g.alchemy.com/v2/<KEY>

# V2 contract addresses (already populated with Sepolia defaults in
# app/config.py — override here for a different deployment)
ETALO_ESCROW_ADDRESS=0xAeC58270973A973e3FF4913602Db1b5c98894640
ETALO_DISPUTE_ADDRESS=0xEe8339b29F54bd29d68E061c4212c8b202760F5b
ETALO_STAKE_ADDRESS=0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB
ETALO_REPUTATION_ADDRESS=0x539e0d44c0773504075E1B00f25A99ED70258178
ETALO_VOTING_ADDRESS=0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A
MOCK_USDT_ADDRESS=0xea07db5d3D7576864ac434133abFE0E815735300

# Indexer
INDEXER_POLL_INTERVAL_SECONDS=30
INDEXER_BLOCK_CHUNK_SIZE=50
INDEXER_REORG_DEPTH=3
INDEXER_START_BLOCK=24720376
INDEXER_ENABLED=true
```

Full list with defaults: `packages/backend/.env.example` and
`packages/backend/app/config.py`.

### First-time setup

```bash
cd packages/backend
python -m venv venv
venv\Scripts\activate              # Windows; source venv/bin/activate elsewhere
pip install -r requirements.txt

# 1. Apply migrations
alembic upgrade head

# 2. Sync ABIs from packages/contracts/artifacts → backend/app/abis/
#    AND packages/miniapp/src/abis/v2/ (single source of truth, dual dest)
python ../contracts/scripts/sync_abis.py
```

### Run dev

```bash
python scripts/run_dev.py
```

This wraps uvicorn with two Windows-specific guards:

- Sets `WindowsSelectorEventLoopPolicy` **before** uvicorn imports
  (psycopg async is incompatible with the default ProactorEventLoop).
- `--reload` is disabled because the reload subprocess re-imports the
  app and loses the policy. Restart manually instead.

The app boots on `http://localhost:8000`, the indexer task starts
automatically (controlled by `indexer_enabled`), and Swagger UI is at
`http://localhost:8000/docs`.

---

## Architecture

```mermaid
graph LR
    subgraph Clients
        MA[Mini App]
        WEB[Public pages]
    end
    subgraph Backend["FastAPI :8000"]
        API[REST routes]
        IDX[Indexer<br/>asyncio task]
        CELO[CeloService<br/>AsyncWeb3]
    end
    subgraph Storage
        PG[(Postgres<br/>cache)]
    end
    RPC[Celo Sepolia RPC<br/>Alchemy]

    MA -->|HTTP JSON| API
    WEB -->|HTTP JSON| API
    API --> PG
    API -.fallback for cold sellers.-> CELO
    IDX -->|writes| PG
    IDX -->|eth_getLogs| RPC
    CELO -->|read calls| RPC
```

### Indexer lifecycle

The indexer is owned by FastAPI's `lifespan`:

```python
# app/main.py
@asynccontextmanager
async def lifespan(app):
    app.state.celo_service = CeloService.from_settings()
    if settings.indexer_enabled:
        indexer = Indexer(celo=..., session_factory=...)
        task = asyncio.create_task(indexer.run())
    yield
    if task is not None:
        app.state.indexer.stop()
        await asyncio.wait_for(task, timeout=10)
```

Each cycle (`Indexer._poll_cycle`):

1. Read `head = eth.get_block("latest")["number"]`. We deliberately
   use `get_block` rather than the awaitable `eth.block_number`
   property — the method is easier to mock with `AsyncMock` in tests.
2. For each tracked contract, load the checkpoint from
   `indexer_state` (or seed it to `INDEXER_START_BLOCK` on first
   run).
3. Walk `[checkpoint - REORG_DEPTH, head]` in chunks of
   `BLOCK_CHUNK_SIZE` (50) — Alchemy enforces this on Celo Sepolia.
4. For each event, look up `(contract_name, event_name)` in
   `HANDLERS` and call it. Handlers are pure-async functions of
   shape `async def handle_X(event, db, services) -> None`.
5. Insert an `IndexerEvent(tx_hash, log_index, ...)` row inside the
   same transaction. The `UNIQUE(tx_hash, log_index)` constraint is
   the idempotency anchor — re-reading the last 3 blocks for reorg
   defense is safe because duplicate events fail the insert and the
   handler-level state changes are conditional on that insert.

### Reorg defense

Celo Sepolia rarely reorgs more than 1–2 blocks, but Alchemy
load-balances RPC reads across nodes whose head-block view diverges
by ±20 blocks. The 3-block re-read window absorbs both effects. The
indexer never deletes rows; it relies on the `UNIQUE(tx_hash,
log_index)` constraint plus idempotent handlers (UPSERT-style
updates) to converge.

### DB schema

Eight V2 tables (Block 2 + Block 5):

| Table                       | Mirror of                                        |
|-----------------------------|--------------------------------------------------|
| `orders`                    | `Escrow.Order` + off-chain metadata (JSONB)      |
| `order_items`               | `Escrow.OrderItem`                               |
| `shipment_groups`           | `Escrow.ShipmentGroup`                           |
| `disputes`                  | `Dispute.Dispute` + photos / conversation JSONB  |
| `stakes`                    | `Stake.SellerStake`                              |
| `reputation_cache`          | `Reputation.SellerReputation`                    |
| `indexer_state`             | last processed block per contract                |
| `indexer_events_processed`  | `(tx_hash, log_index)` — idempotency anchor      |

All USDT amounts are stored as `BIGINT` in the smallest unit
(6 decimals). All addresses are `VARCHAR(42)` lowercase, enforced by
a CHECK constraint. ENUM columns use Postgres native types with
explicit names so Alembic upgrades preserve order.

---

## API endpoints

The interactive reference is FastAPI's auto-generated Swagger UI:
`http://localhost:8000/docs`.

V2 endpoints (Block 6):

### Public reads (11 GET, no auth)

| Method | Path                                       | Returns                          |
|--------|--------------------------------------------|----------------------------------|
| GET    | `/api/v1/orders`                           | paginated list (filter by buyer/seller/status) |
| GET    | `/api/v1/orders/{uuid}`                    | one Order                        |
| GET    | `/api/v1/orders/by-onchain-id/{n}`         | one Order                        |
| GET    | `/api/v1/orders/{uuid}/items`              | items in order                   |
| GET    | `/api/v1/orders/{uuid}/groups`             | shipment groups in order         |
| GET    | `/api/v1/items/{uuid}`                     | one OrderItem                    |
| GET    | `/api/v1/items/by-onchain-id/{n}`          | one OrderItem                    |
| GET    | `/api/v1/disputes/{uuid}`                  | one Dispute                      |
| GET    | `/api/v1/disputes/by-onchain-id/{n}`       | one Dispute                      |
| GET    | `/api/v1/disputes/by-item?order_id&item_id`| one Dispute                      |
| GET    | `/api/v1/sellers/{address}/profile`        | stake + reputation snapshot      |

The `/disputes/by-item` and `/disputes/by-onchain-id/...` paths are
declared **before** `/disputes/{uuid}` in the router so FastAPI does
not interpret the literal segment as a UUID.

`/sellers/{address}/profile` falls back to a live RPC read when the
seller has not yet been indexed (cold address). The response includes
a `source: "indexer" | "rpc_fallback"` field so the frontend can
distinguish.

### Authenticated writes (3 POST, EIP-191)

| Method | Path                                | Payload                  |
|--------|-------------------------------------|--------------------------|
| POST   | `/api/v1/orders/{uuid}/metadata`    | delivery address, tracking, notes |
| POST   | `/api/v1/disputes/{uuid}/photos`    | IPFS hash, appended to JSONB array |
| POST   | `/api/v1/disputes/{uuid}/messages`  | message text, appended to conversation thread |

Authorization: caller (recovered from signature) must be the buyer or
seller of the underlying order/dispute. Returns 403 otherwise.

### Curl examples

```bash
# Public read
curl http://localhost:8000/api/v1/orders/by-onchain-id/1

# Authenticated write — see "EIP-191 Authentication" below for sig
curl -X POST http://localhost:8000/api/v1/orders/<uuid>/metadata \
  -H "Content-Type: application/json" \
  -H "X-Etalo-Signature: 0x..." \
  -H "X-Etalo-Timestamp: 1714050000" \
  -d '{"delivery_address":"12 Rue Test, Paris","tracking_number":"DHL-42"}'
```

---

## EIP-191 authentication

The three POST endpoints are gated by an EIP-191 `personal_sign`
signature over a canonical message. There is no session, no JWT —
each request carries its own signature.

### Canonical message

```
Etalo auth: {METHOD} {PATH} {TIMESTAMP}
```

- `METHOD` is uppercase (`POST`).
- `PATH` is the request path **without** query string
  (`/api/v1/orders/<uuid>/metadata`).
- `TIMESTAMP` is the Unix epoch in seconds.

### Headers

| Header              | Value                       |
|---------------------|-----------------------------|
| `X-Etalo-Signature` | `0x` + 65-byte ECDSA sig    |
| `X-Etalo-Timestamp` | Unix seconds (string)       |

### Server-side check (`app/auth.py`)

1. Timestamp window: `now - 300 ≤ ts ≤ now + 60` — rejects replays
   older than 5 minutes and clocks skewed more than 1 minute ahead.
2. `Account.recover_message(encode_defunct(text=msg), signature=sig)`
   gives the signer address.
3. Endpoint-level authorization (e.g. dispute photo append) checks
   that the signer matches the buyer or seller stored on the row.

### Client-side (TypeScript with viem)

```ts
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(PRIVATE_KEY);
const ts = Math.floor(Date.now() / 1000);
const msg = `Etalo auth: POST /api/v1/orders/${orderId}/metadata ${ts}`;
const signature = await account.signMessage({ message: msg });

await fetch(`/api/v1/orders/${orderId}/metadata`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Etalo-Signature": signature,
    "X-Etalo-Timestamp": String(ts),
  },
  body: JSON.stringify({ delivery_address: "..." }),
});
```

Failure modes:

| Scenario                          | Status |
|-----------------------------------|--------|
| Missing headers                   | 422    |
| Malformed signature               | 401    |
| Timestamp outside window          | 401    |
| Signer ≠ buyer/seller of resource | 403    |

---

## Indexer handlers coverage

15 of ~40 V2 events have handlers wired in Block 5. They cover the
critical happy-path:

- `Escrow`: OrderCreated, OrderFunded, ItemShipped, ItemReleased,
  GroupArrivedAtCustoms, GroupConfirmedByBuyer
- `Dispute`: DisputeOpened, DisputeResolvedN1, DisputeResolvedN2
- `Stake`: StakeDeposited, StakeSlashed
- `Reputation`: OrderRecorded, ReputationSynced
- `Voting`: (none — V1.5)

The remaining 25 are tracked in `packages/backend/scripts/INDEXER_HANDLERS_TODO.md`
and implemented on demand. The pattern is "add a handler the first
time an endpoint or test needs the event reflected in the cache."

---

## Testing

54 tests, three layers:

| Layer | Count | Command                                |
|-------|-------|----------------------------------------|
| Unit  | 32    | `pytest tests/ -m "not e2e"`           |
| E2E   | 18    | `pytest tests/e2e -v -m e2e`           |
| Misc  | 4     | included in unit run                   |

E2E tests use:

- A live Postgres connection (the dev DB; tests use unique-id rows
  or session-scope seed cleanup to avoid pollution).
- Live Sepolia RPC for the indexer one-cycle test.
- httpx `ASGITransport` against the FastAPI app — note that this
  does **not** trigger the lifespan, so `app.state.celo_service` is
  attached manually in the `client` fixture.

The `seed_j4_data` session-scope fixture inserts canonical J4 outcomes
(scenario 1 order CHIOMA/AISSA, ADR-033 orphan stake, scenario 3
N1-resolved dispute) so endpoint tests do not depend on indexer
catch-up time.

---

## Future work (V1.5+)

- **Block 5b** — implement the 25 deferred indexer handlers, in
  particular Voting + Withdrawal + DisputeEscalated which the V1.5
  community-vote UI will need.
- **Block 7b** — full first-sync indexer test from
  `INDEXER_START_BLOCK = 23761654` (~12 min runtime), plus
  `/disputes/{id}/photos` + `/messages` JSONB append flow tests.
- **Analytics refactor** — `app/routers/analytics.py` still
  references V1 column names (e.g. `Order.amount_usdt`,
  `Order.status` as a string). Either port to V2 schema or retire.
- **WebSocket subscriptions** — replace the 30 s polling loop with
  Alchemy's `eth_subscribe` once Celo Sepolia exposes it on the
  pricing tier we use.
- **SIWE EIP-4361 sessions** — replace per-request EIP-191
  signatures with a session token issued after one SIWE handshake,
  for write-heavy seller flows where signing every POST is
  cumbersome.
- **Reputation cache TTL** — today the cache is updated by the
  `ReputationSynced` handler, with no time-based invalidation. Add
  a "stale-after" timestamp + lazy refresh on read for sellers
  whose snapshot pre-dates the latest contract upgrade.
