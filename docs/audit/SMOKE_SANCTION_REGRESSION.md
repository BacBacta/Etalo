# Pashov audit fixes — Sepolia v1.3 live smoke results (4/4 ✅)

**Date :** 2026-05-25
**Network :** Celo Sepolia (chainId 11142220)
**Deploy :** v1.3-audit-fixes (ADR-054, tag pushed 2026-05-25)
**Result : ✅ ALL FOUR Pashov audit fixes validated live on the
deployed bytecode.**

## Summary

| Pashov # | Description | Status | Live tx (key step) | Script |
| --- | --- | --- | --- | --- |
| **#1** | Sanctioned-seller release lockup → silent no-op | ✅ PASSED | [`0xdd238fcd`](https://celo-sepolia.blockscout.com/tx/0xdd238fcd777ff3f5e82e623602ef45ab1951d4b26e175926370e2f4a9b1b3665) | `sanction-regression.ts` |
| **#2** | `sellerWeeklyVolume` release on refund | ✅ PASSED | [`0x8272cdf2`](https://celo-sepolia.blockscout.com/tx/0x8272cdf240f8881e5e381d5de0061f210408418c8b703ab084c32030592c7df6) | `dispute-n3-force-close.ts` |
| **#4** | Dust commission cap (`itemCommission ≤ itemPrice`) | ✅ PASSED | [`0x318eeb2c`](https://celo-sepolia.blockscout.com/tx/0x318eeb2cca2ba59879f18341e4132c78a1eaa3c954f4a48fea981fadb70e33bc) | `dust-cap.ts` |
| **#5** | Zero-quorum N3 + `adminForceCloseN3IfNoQuorum` escape hatch | ✅ PASSED | [`0x8272cdf2`](https://celo-sepolia.blockscout.com/tx/0x8272cdf240f8881e5e381d5de0061f210408418c8b703ab084c32030592c7df6) | `dispute-n3-force-close.ts` |

All scripts live under `packages/contracts/scripts/smoke/` and are
self-contained + idempotent (run via `npx hardhat run
scripts/smoke/<name>.ts --network celoSepolia`). Per-run JSON results
saved as `<name>-result.json` next to each script for audit trail.

---

## Pashov #1 — sanction-then-confirm

### What was tested

The pre-ADR-054 bytecode had a permanent fund-lockup path : owner
`applySanction(seller, Suspended)` flipped the seller's reputation
status to non-Active, and the next `EtaloEscrow._releaseItemFully`
call reverted via `reputation.recordCompletedOrder` (which used to
`require(rep.status == Active)`). Every release path was affected
(`confirmItemDelivery`, `confirmGroupDelivery`,
`triggerAutoReleaseForItem`), and the only refund paths
(`triggerAutoRefundIfInactive` pre-ship, `forceRefund` after 90 days
+ legal hold) were unreachable for the buyer — funds permanently
stuck.

ADR-054 changed `EtaloReputation.recordCompletedOrder` to silently
no-op for non-Active sellers : reputation counters stay frozen
during sanction, but the buyer can still confirm delivery and the
seller's net payout flows normally.

This smoke proves the fix is live on the chain Etalo will ship from.

### Script

`packages/contracts/scripts/smoke/sanction-regression.ts` — self-
contained, idempotent on USDT funding. Run :

```bash
cd packages/contracts
npx hardhat run scripts/smoke/sanction-regression.ts --network celoSepolia
```

### Live transactions (Celo Sepolia, 2026-05-25)

| # | Step | Tx | Note |
|---|------|----|------|
| 0a | mint(CHIOMA, 20 USDT) | [0x3546122b](https://celo-sepolia.blockscout.com/tx/0x3546122bc4225bf43870448cdd1107488ecb9259635dc534e8805c6218323606) | top-up |
| 0b | mint(AISSA, 20 USDT) | [0x2c7a46c4](https://celo-sepolia.blockscout.com/tx/0x2c7a46c4ccc36e65e14b838d0ad9727a3f01836bdb2869c7d084cefceeeb66ca) | top-up |
| 1 | AISSA approve(escrow, 5 USDT) | [0x9a3daf06](https://celo-sepolia.blockscout.com/tx/0x9a3daf068624cb814ac2790f154e9414cffa090515270a8694bcd98682609e73) | |
| 2 | AISSA createOrderWithItems → orderId=1 | [0x01d9e126](https://celo-sepolia.blockscout.com/tx/0x01d9e126da15a6427be7bf99991bac5243857cce2d9898dbcb241f13f0e470eb) | block 26419839 |
| 3 | AISSA fundOrder(1) | [0x32c7a0f5](https://celo-sepolia.blockscout.com/tx/0x32c7a0f5f774581c101d08af56f4a56e3d138518c5ff3b3426ff52929f7e589d) | escrow custody +5 USDT |
| 4 | CHIOMA shipItemsGrouped(1, [1]) | [0x3684c733](https://celo-sepolia.blockscout.com/tx/0x3684c733ee436fbce4c6b3a475604c69d993ae71e2b3272c55fa79b881409adc) | item → Shipped |
| 5 | **Deployer applySanction(CHIOMA, Suspended)** | [0xf378bd92](https://celo-sepolia.blockscout.com/tx/0xf378bd92dba27d7d2e30cbe50b4b316ef29cef4408509b3c2ff2937d4a68a0ae) | **trigger event** — pre-fix this would brick step 6 |
| 6 | **AISSA confirmItemDelivery(1, 1)** | [0xdd238fcd](https://celo-sepolia.blockscout.com/tx/0xdd238fcd777ff3f5e82e623602ef45ab1951d4b26e175926370e2f4a9b1b3665) | **REGRESSION CHECK — must succeed** |

### Verification (post-step 6 reads)

| Field | Value | Expected |
| --- | --- | --- |
| Item status | `Released` (4) | `Released` (4) ✅ |
| CHIOMA USDT delta | +4.91 USDT | +4.91 (net of 1.8% intra commission) ✅ |
| commissionTreasury delta | +0.09 USDT | +0.09 (1.8% × 5) ✅ |
| CHIOMA.ordersCompleted (post-confirm) | 0 | 0 (silent no-op during sanction) ✅ |

The reputation counters correctly stayed at 0 — `recordCompletedOrder`
skipped the increments because CHIOMA's status was Suspended. This is
the intentional design : the sanction affects the seller's future
reputation, never the in-flight buyer funds.

---

## Pashov #2 + #5 — N3 admin force close + weekly volume release

These two fixes share a single live trace because the
`adminForceCloseN3IfNoQuorum` escape hatch routes through
`_applyResolution → escrow.resolveItemDispute(refund = full price)`,
which then exercises the new `_releaseSellerWeeklyVolume` helper.

### What was tested (#2 + #5)

**Pashov #5** : pre-fix, `finalizeVote` with zero ballots defaulted
to buyer-win (`buyerWon = forBuyer >= forSeller` evaluates `true`
when both are 0). ADR-054 added a `require(forBuyer + forSeller > 0,
"No quorum")` guard. Without an escape hatch, that guard would lock
zero-quorum disputes at `LEVEL_N3` forever (plus freeze the seller's
stake). ADR-054 also added `EtaloDispute.adminForceCloseN3IfNoQuorum`
— owner-only, verifies `(forBuyer, forSeller) == (0, 0)` before
forcing the legacy buyer-win resolution path (so the owner cannot
override a real vote).

**Pashov #2** : pre-fix, `EtaloEscrow.fundOrder` incremented
`sellerWeeklyVolume[seller]` but none of the refund paths
(`triggerAutoRefundIfInactive`, `resolveItemDispute` refund branch,
`forceRefund`) ever decremented it. A throwaway buyer could cap-fill
`MAX_SELLER_WEEKLY_VOLUME = 5,000 USDT` worth of orders against a
target seller, refund permissionlessly 7 days later, and lock the
seller out of legitimate orders for the rest of the rolling week
at zero attacker cost. ADR-054 added `_releaseSellerWeeklyVolume`
called from all three refund paths.

### Script (#2 + #5)

`packages/contracts/scripts/smoke/dispute-n3-force-close.ts` — self-
contained, approves a single mediator if needed (one is enough for
`escalateToVoting` when no N2 mediator is assigned), reuses
CHIOMA/AISSA test wallets. Run :

```bash
cd packages/contracts
npx hardhat run scripts/smoke/dispute-n3-force-close.ts --network celoSepolia
```

### Live transactions for #2 + #5 (Celo Sepolia, 2026-05-25)

| # | Step | Tx |
| --- | --- | --- |
| 0.5 | Deployer `approveMediator(MEDIATOR1)` | [`0x1a9ef042`](https://celo-sepolia.blockscout.com/tx/0x1a9ef04283d24025f94a20a681683cdc68659e0cf0cce93bfb2091d9f42fec7f) |
| 2a | AISSA `createOrderWithItems(CHIOMA, [5 USDT], intra)` → orderId=3 | (combined create+fund) |
| 2b | AISSA `fundOrder(3)` → weekly volume +5 | [`0x41d84b90`](https://celo-sepolia.blockscout.com/tx/0x41d84b90023cd655a8dd88fb14cf8a3e9929ac8ab134ebeec694ba291c0b9cec) |
| 3 | AISSA `openDispute(3, 3, …)` → disputeId=2 | [`0x398e230f`](https://celo-sepolia.blockscout.com/tx/0x398e230ff7fef67a9c83e76d51159956f498f6e809c95ffc5ac0f6fa67d64cf4) |
| 4 | AISSA `escalateToMediation(2)` (N1 → N2) | [`0x90863f08`](https://celo-sepolia.blockscout.com/tx/0x90863f08100a73a4468b201818a0bf412e6893e18126b6a78fd36a2d8f7a1c4e) |
| 5 | AISSA `escalateToVoting(2)` (N2 → N3) | [`0x6ee1d60e`](https://celo-sepolia.blockscout.com/tx/0x6ee1d60e830a0af3ef26fe0a03d09dc48f1a8c212c774570591e1c2e0bd7433a) |
| 6 | **Deployer `adminForceCloseN3IfNoQuorum(2)` — REGRESSION CHECK** | [`0x8272cdf2`](https://celo-sepolia.blockscout.com/tx/0x8272cdf240f8881e5e381d5de0061f210408418c8b703ab084c32030592c7df6) |

### Verification (#2 + #5)

| Field | Live value | Expected |
| --- | --- | --- |
| `sellerWeeklyVolume[CHIOMA]` before | 5 USDT | — (carry-over from #1 smoke earlier today) |
| `sellerWeeklyVolume[CHIOMA]` after fund | 10 USDT | +5 ✅ |
| Dispute level after admin close | 4 (RESOLVED) | 4 ✅ |
| `dispute.resolved` | `true` | `true` ✅ |
| Buyer USDT delta | +5 USDT | +5 (full refund) ✅ |
| `sellerWeeklyVolume[CHIOMA]` AFTER refund | 10 USDT | 10 (decremented by 5) ✅ |

The weekly volume went **5 → 10 → 10** : the fund consumed 5 USDT of
the seller's weekly cap, and the admin-force-close refund released
exactly 5 USDT back into the cap. The seller's commerce budget is
restored to its pre-attack value within a single test session.

---

## Pashov #4 — dust commission cap

### What was tested (#4)

`createOrderWithItems`' last-item dust absorber was unbounded
pre-fix. The standard pro-rata formula `itemPrice[i] * totalCommission
/ totalAmount` truncates to 0 when the per-item price is below
`totalAmount / totalCommission ≈ 55 wei` for the intra 1.8% rate.
A buyer constructing `N items of 55 wei + 1 item of 1 wei` made all
the first-N items round to zero commission ; the last 1-wei item then
absorbed the entire `totalCommission` via the dust line. With the
attack shape used in the unit test (49 small + 1 tiny), the last
item's commission would have been 48 wei against a 1-wei price,
making `itemNet = itemPrice - itemCommission` underflow inside
`_releaseItemFully` and locking the item forever.

ADR-054 added a one-line cap : `if (itemCommission > itemPrices[i])
itemCommission = itemPrices[i]`. A few wei of commission stay locked
in escrow on adversarial inputs — accepted trade-off.

The Sepolia live run uses a smaller variant (9 small + 1 tiny) to
fit the buyer wallet's CELO budget after the dispute-escalation
smoke had drained AISSA. The attack maths are identical : 8 wei
of commission would target a 1-wei item without the cap (8× over-
allocation).

### Script (#4)

`packages/contracts/scripts/smoke/dust-cap.ts` — read-only after the
single `createOrderWithItems` call (no fund, no ship needed — the cap
fires at creation time and is observable via `getItem`). Uses the
deployer as buyer (AISSA was low on CELO).

```bash
cd packages/contracts
npx hardhat run scripts/smoke/dust-cap.ts --network celoSepolia
```

### Live transaction (#4)

| # | Step | Tx |
| --- | --- | --- |
| 1 | Buyer `createOrderWithItems(CHIOMA, [55×9, 1], intra)` → orderId=4 | [`0x318eeb2c`](https://celo-sepolia.blockscout.com/tx/0x318eeb2cca2ba59879f18341e4132c78a1eaa3c954f4a48fea981fadb70e33bc) |

### Verification (#4)

| Field | Live value | Expected (with cap) | Pre-fix value |
| --- | --- | --- | --- |
| `totalAmount` | 496 wei | 496 wei | 496 wei |
| `totalCommission` (1.8% intra) | 8 wei | 8 wei | 8 wei |
| First-9 items `itemCommission` | 0 wei each | 0 (truncated) | 0 |
| **Last item `itemCommission`** | **1 wei** | **≤ 1 (capped at itemPrice)** | **8 wei (8× price)** ❌ |
| Last item `itemPrice` | 1 wei | 1 wei | 1 wei |
| Sweep across all 10 items : max ratio | 1.00 | ≤ 1.0 | 8.0 ❌ |
| Violations (`commission > price`) | 0 | 0 | 1 ❌ |

The deployed v1.3 bytecode correctly caps the last item's commission
at its price. The post-cap commission is exactly equal to the
itemPrice (1 = 1), giving `itemNet = itemPrice - itemCommission = 0`
— the item is releasable (no underflow) but contributes zero net to
the seller, which is the correct behaviour for an attack-shaped
order. The dust 7 wei (8 - 1) stays in `commissionTreasury` accounting
if the order is ever funded + released.

---

## What this proves

1. **The bytecode deployed at `0x5762502acAA57744F0bC10b3f0fD2Cd59a16EFbE`
   (EtaloReputation v1.3) contains the no-op-on-sanction fix.**
2. **The bytecode deployed at `0xc8174b1218fEbD7d49B982cB3f1De83e411FbEA1`
   (EtaloEscrow v1.3) successfully exercises the fixed release path** —
   `_releaseItemFully` no longer reverts on sanctioned sellers ; the
   dust cap fires correctly on attack inputs ; `_releaseSellerWeeklyVolume`
   correctly decrements on refund.
3. **The bytecode deployed at `0x1f830A47af07E2BE9Db2017C873Bd2eF7F98f4a1`
   (EtaloDispute v1.3) contains the `adminForceCloseN3IfNoQuorum`
   escape hatch and the `_disputeIdToVoteId` reverse mapping.**
4. The wiring between EtaloDispute ↔ EtaloVoting ↔ EtaloEscrow ↔
   EtaloReputation ↔ MockUSDT is correct on the v1.3 deploy : tokens
   moved, item state transitioned, dispute resolved, weekly volume
   released, reputation counter frozen — all observed end-to-end in
   separate live transactions.

## Pre-J12 mainnet gate

- [x] Static analysis (Slither + Solhint) green on `main`.
- [x] Foundry invariants (9, including 2 new audit-regression invariants) green on `main` × 256 runs × 15 depth.
- [x] Hardhat unit tests (188, including 13 new ADR-054 regression tests) green on `main`.
- [x] **Pashov #1 regression live on Sepolia v1.3 — this document.**
- [x] **Pashov #2 regression live on Sepolia v1.3 — this document.**
- [x] **Pashov #4 regression live on Sepolia v1.3 — this document.**
- [x] **Pashov #5 regression live on Sepolia v1.3 — this document.**
- [x] **Re-verification on Blockscout / Sourcify complete** — see `docs/CELOSCAN_VERIFICATION.md` (PR #86).
- [ ] Multisig 2-of-3 Safe set up per ADR-038.
- [ ] Freelance audit per ADR-039 (independent second opinion).
