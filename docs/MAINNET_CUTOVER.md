# Mainnet cutover — production env var checklist

**Purpose:** switch the Etalo production runtime (web + backend) from
Celo Sepolia to **Celo mainnet** addresses. This is the final step
between the v1.4-mainnet contract release and real-user traffic.

**Status:** ⏳ env override pending — runtime defaults in code still
point to Sepolia by design (safer for local dev). Production deploy
MUST set the mainnet env vars below.

**Pre-conditions (all complete) :**

- [x] V1.3 audit fixes shipped (ADR-054)
- [x] V1.4 mainnet contracts deployed + verified
- [x] V1.4 mainnet Safe 2-of-3 created + 9 ownership rotation done
- [x] `v1.4-mainnet` tag pushed

**Source of truth :** `packages/contracts/deployments/celo-mainnet-v2.json`.

---

## 1. Why defaults stay Sepolia

Both `packages/backend/app/config.py` and `packages/web/.env.example`
keep Sepolia testnet defaults intentionally. Rationale :

- Local dev `pnpm dev` or `python -m app.main` hits Sepolia
  automatically — no chance of accidentally pinging mainnet during
  iteration.
- Forgetting the env override on a dev machine = noisy (Sepolia
  faucet runs out, smoke runs fail) rather than silent (real-USDT
  tx broadcast).
- Production deploys (Vercel for web, Fly.io for backend) explicitly
  set the env vars below — this is a deliberate operator action,
  not a default behavior.

To run the dev stack against mainnet locally, set the env vars
below in `packages/backend/.env.local` and `packages/web/.env.local`.
Both are `.gitignore`d.

---

## 2. Backend env vars (Fly.io secrets)

Set via `fly secrets set` in the backend deploy environment. All
values come from `packages/contracts/deployments/celo-mainnet-v2.json`.

```bash
fly secrets set \
  CELO_RPC_URL=https://forno.celo.org \
  CELO_SEPOLIA_RPC=https://forno.celo.org \
  MOCK_USDT_ADDRESS=0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e \
  ETALO_REPUTATION_ADDRESS=0xaF890609a3B2AF6E1E2Ebf91267347133b5065AD \
  ETALO_STAKE_ADDRESS=0x3D588192BC76e38a3f6453E45A9B9aD0Dc85bc9A \
  ETALO_VOTING_ADDRESS=0xa1C48f2f962484D63D4D1b04C9c2574Da2C0EcBA \
  ETALO_DISPUTE_ADDRESS=0x6d5Aa5e0EAE407688E99492213849D9a608D63d2 \
  ETALO_ESCROW_ADDRESS=0x0890D9bCE4E71148b135A99Cf501DE52Aa05Ee92 \
  ETALO_CREDITS_ADDRESS=0xDDbE5BEC28B4eC0a309fca87047750EF4b42F7d6 \
  COMMISSION_TREASURY_ADDRESS=0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F \
  CREDITS_TREASURY_ADDRESS=0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F \
  COMMUNITY_FUND_ADDRESS=0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F \
  --app etalo-api
```

**Notes on this set :**

- `MOCK_USDT_ADDRESS` is the variable name in code but the value on
  mainnet is the **real Celo Tether** (`0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`).
  No MockUSDT exists on mainnet. The variable name should be
  refactored to `USDT_ADDRESS` in V1.1 — for now, the legacy name
  is reused to avoid touching every indexer touchpoint.
- Both `CELO_RPC_URL` and `CELO_SEPOLIA_RPC` point to mainnet —
  the legacy `celo_rpc_url` field in `app/services/celo.py` is
  flagged in `config.py` as removable in Sprint J5 Block 4. Until
  then, set both to the same value to avoid split-brain.
- The 3 treasury addresses all point to the **Safe address**
  (`0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F`). The Safe owns
  the 3 treasury slots in EtaloEscrow. ADR-024 logical separation
  is preserved off-chain — admin Safe txs can route incoming revenue
  to dedicated sub-accounts in V1.1+ when accumulation justifies
  the split.

---

## 3. Frontend env vars (Vercel)

Set via Vercel project Settings → Environment Variables (or `vercel env add`).
All `NEXT_PUBLIC_*` vars are exposed to the browser bundle — they
must be set at **build time** (not just runtime).

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_CELO_RPC_URL` | `https://forno.celo.org` |
| `NEXT_PUBLIC_CHAIN_ID` | `42220` |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | `0x0890D9bCE4E71148b135A99Cf501DE52Aa05Ee92` |
| `NEXT_PUBLIC_DISPUTE_ADDRESS` | `0x6d5Aa5e0EAE407688E99492213849D9a608D63d2` |
| `NEXT_PUBLIC_STAKE_ADDRESS` | `0x3D588192BC76e38a3f6453E45A9B9aD0Dc85bc9A` |
| `NEXT_PUBLIC_REPUTATION_ADDRESS` | `0xaF890609a3B2AF6E1E2Ebf91267347133b5065AD` |
| `NEXT_PUBLIC_VOTING_ADDRESS` | `0xa1C48f2f962484D63D4D1b04C9c2574Da2C0EcBA` |
| `NEXT_PUBLIC_USDT_ADDRESS` | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` |
| `NEXT_PUBLIC_CREDITS_ADDRESS` | `0xDDbE5BEC28B4eC0a309fca87047750EF4b42F7d6` |

**Vercel-specific :**

- Set these on the **Production** environment only. Preview / Dev
  environments stay Sepolia for PR review safety.
- Trigger a fresh deploy after env update (Vercel does NOT
  auto-rebuild on env change).
- Verify via the Vercel preview URL after deploy : open browser
  devtools → Network → first XHR to a contract call should hit
  `forno.celo.org`, not `celo-sepolia.*`.

---

## 4. MiniPay integration — fee currency

MiniPay supports CIP-64 transactions with USDT as `feeCurrency`
(per ADR-003). The USDT adapter address on mainnet is fixed :

```text
USDT adapter (gas fees) : 0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72
```

This is set in `packages/web/src/lib/minipay-fee-currency.ts` or
equivalent. Verify it's enabled in the production build only after
the Vercel env vars above are set — otherwise the build hits
Sepolia chainId and CIP-64 would reject with "unknown fee currency".

---

## 5. Cutover sequence (recommended order)

1. **Backend first** (so off-chain indexer is ready to mirror mainnet
   state before any user tries) :

   ```bash
   fly secrets set [all vars above] --app etalo-api
   fly deploy --app etalo-api
   # Wait for healthcheck green
   curl https://etalo-api.fly.dev/api/v1/health
   # Confirm response includes "chain": "celo", "chainId": 42220
   ```

2. **Frontend second** (browser only sees mainnet once Vercel
   rebuilds) :

   - Set Vercel env vars (UI or `vercel env add` for each)
   - Trigger a manual production deploy : `vercel --prod`
   - Or git push the next commit (Vercel auto-deploys main)
   - Verify : open `etalo.app` in incognito → devtools shows RPC
     calls to `forno.celo.org`

3. **Smoke test** : Mike sends his first real-USDT order from his
   own MiniPay wallet to a test seller wallet. Verify :
   - Order appears in CeloScan at the mainnet EtaloEscrow address
   - Funds deducted from Mike's wallet
   - Item state transitions Pending → Shipped → Released visible
     in the dashboard

4. **Public announcement** : once smoke test green, announce launch
   on the channels (MiniPay listing, Twitter, etc.).

---

## 6. Rollback plan (if mainnet cutover reveals an issue)

The Sepolia contracts are still operational and untouched. To roll
back :

1. Revert the env vars to their Sepolia values (the values in
   `packages/web/.env.example` and `packages/backend/app/config.py`
   defaults).
2. Redeploy backend (Fly) + frontend (Vercel).
3. Users currently mid-flow on mainnet are NOT rolled back — their
   funds remain in the mainnet EtaloEscrow contract until manually
   refunded via the Safe (admin operation per
   `docs/MULTISIG_OPS.md` §3).

Rollback should be a last resort — investigate the issue in
parallel via Sepolia smoke scripts before triggering.

---

## 7. Post-cutover verification

After backend + frontend are deployed to mainnet :

- [ ] Backend `/api/v1/health` returns `chainId: 42220`
- [ ] Frontend devtools shows RPC calls to `forno.celo.org`
- [ ] Mike's first mainnet order goes through end-to-end (create → fund → ship → confirm)
- [ ] Mainnet `EtaloEscrow.getOrderCount()` increments after the smoke order
- [ ] Backend indexer (J5) picks up the new mainnet events (check
      `orders` table for the smoke order row)
- [ ] CeloScan shows the smoke txs from / to the expected addresses

---

## 8. References

- `packages/contracts/deployments/celo-mainnet-v2.json` — canonical mainnet addresses
- `docs/DEPLOYMENTS_HISTORY.md` "V1 mainnet deploy" section
- `CLAUDE.md` "Key addresses (Celo mainnet)" section
- `docs/MULTISIG_OPS.md` — Safe admin tx procedures
- `docs/audit/MULTISIG_REHEARSAL.md` — workflow validation log
- ADR-054 (audit fixes) + ADR-055 (multisig)
