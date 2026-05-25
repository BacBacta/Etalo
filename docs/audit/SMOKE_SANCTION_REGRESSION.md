# Pashov #1 sanction-then-confirm regression — Sepolia v1.3 live result

**Date :** 2026-05-25
**Network :** Celo Sepolia (chainId 11142220)
**Deploy :** v1.3-audit-fixes (ADR-054, tag pushed 2026-05-25)
**Result : ✅ PASSED — Pashov audit finding #1 fix is live on the
deployed bytecode.**

## What was tested

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

## Script

`packages/contracts/scripts/smoke/sanction-regression.ts` — self-
contained, idempotent on USDT funding. Run :
```bash
cd packages/contracts
npx hardhat run scripts/smoke/sanction-regression.ts --network celoSepolia
```

## Live transactions (Celo Sepolia, 2026-05-25)

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

## Verification (post-step 6 reads)

| Field | Value | Expected |
|-------|-------|----------|
| Item status | `Released` (4) | `Released` (4) ✅ |
| CHIOMA USDT delta | +4.91 USDT | +4.91 (net of 1.8% intra commission) ✅ |
| commissionTreasury delta | +0.09 USDT | +0.09 (1.8% × 5) ✅ |
| CHIOMA.ordersCompleted (post-confirm) | 0 | 0 (silent no-op during sanction) ✅ |

The reputation counters correctly stayed at 0 — `recordCompletedOrder`
skipped the increments because CHIOMA's status was Suspended. This is
the intentional design : the sanction affects the seller's future
reputation, never the in-flight buyer funds.

## What this proves

1. **The bytecode deployed at `0x5762502acAA57744F0bC10b3f0fD2Cd59a16EFbE`
   (EtaloReputation v1.3) contains the no-op-on-sanction fix.**
2. **The bytecode deployed at `0xc8174b1218fEbD7d49B982cB3f1De83e411FbEA1`
   (EtaloEscrow v1.3) successfully exercises the fixed release path** —
   `_releaseItemFully` no longer reverts on sanctioned sellers.
3. The wiring between EtaloEscrow ↔ EtaloReputation ↔ MockUSDT is
   correct on the v1.3 deploy : tokens moved, item state transitioned,
   reputation counter frozen, all in a single transaction.

## Pre-J12 mainnet gate

- [x] Static analysis (Slither + Solhint) green on `main`.
- [x] Foundry invariants (9, including 2 new audit-regression invariants) green on `main` × 256 runs × 15 depth.
- [x] Hardhat unit tests (188, including 13 new ADR-054 regression tests) green on `main`.
- [x] **Pashov #1 regression live on Sepolia v1.3 — this document.**
- [ ] Re-verification on Blockscout / Sourcify for the v1.3 addresses (banner in `docs/CELOSCAN_VERIFICATION.md`).
- [ ] Multisig 2-of-3 Safe set up per ADR-038.
- [ ] Freelance audit per ADR-039 (independent second opinion).
