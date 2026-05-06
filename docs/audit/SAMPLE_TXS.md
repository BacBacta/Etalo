# Sample transactions per V2 contract method

**Date** : 2026-05-06
**Network** : Celo Sepolia (chainId 11142220)
**Bundle** : Post-H-1 redeploy (PR #8 merged) + Celoscan/Blockscout source-verification (PR ops/celoscan-verify-h1-redeploy)
**MiniPay listing prereq** : §3 — for every user-facing public method, provide a sample on-chain transaction link
**Branch** : `ops/sample-tx-j11`

> **Related audit artifacts** :
> - Source-verification : `docs/CELOSCAN_VERIFICATION.md` (PR ops/celoscan-verify-h1-redeploy)
> - PageSpeed baseline : `docs/audit/lighthouse/` (PR ops/pagespeed-baseline-j11)
> - Network supply-chain manifest : `docs/NETWORK_MANIFEST.md`
> - Pre-J11 audit synthesis : `docs/AUDIT_PRE_J11_SUMMARY.md` (PR docs/j11-pre-audit)
> - Post-fix verification (H-1) : `docs/audit/H1_POST_FIX_VERIFICATION.md`
> - Deployment artifact : `packages/contracts/deployments/celo-sepolia-v2.json`

---

## Status legend

| Symbol | Meaning |
|---|---|
| ✓ | Sample tx captured + linked |
| ⏳ TBD | Awaiting smoke E2E execution (J11.5 Block 8) |
| ⏳ Time-bound | Cannot exercise in same-day smoke session ; surfaces post-mainnet via natural usage (3-day / 7-day timers, Sepolia has no `evm_increaseTime` like Hardhat) |
| 🔒 Operational | Exercisable but operationally costly to set up live (e.g. `emergencyPause` would lock Sepolia escrow for `EMERGENCY_PAUSE_MAX = 7 days` per ADR-026 ; `forceRefund` 3-condition combo per ADR-023 not reproducible in a single session). Documented as operational procedure, reserved for first incident response |
| 🔒 V2-deferred | Intentional architecture per ADR-041, exemplification post-V2 reactivation sprint |

---

## §1 — V1 user-facing methods (priority for listing reviewer)

For Sprint J11 listing submission, all entries below are TBD pending the smoke E2E execution combined into Sprint J11.5 Block 8 (`docs/SPRINT_J11_5.md`, formerly tracked as FU-J11-004 — combined). The orchestrator script (`packages/contracts/scripts/smoke-e2e-j11-5.ts`) runs a full happy path + cancellation + dispute + admin + credits flow on Sepolia, captures the resulting tx hashes in `docs/audit/smoke-e2e-tx-output.json`, and the operator fills this section from that output. Pre-J12 mainnet listing acceptance criterion : 0 TBD entries in this section.

| Method | Contract | Status | Sample tx | Block | Smoke step | Notes |
|--------|----------|--------|-----------|-------|------------|-------|
| `createOrderWithItems` | EtaloEscrow | ⏳ TBD | — | — | J11.5 §A.1 | Buyer creates 1-item order with single seller (intra-Africa, 5 USDT) |
| `fundOrder` | EtaloEscrow | ⏳ TBD | — | — | J11.5 §A.2 | Buyer USDT.approve(escrow, amount) preceded ; escrow custody += amount |
| `shipItemsGrouped` | EtaloEscrow | ⏳ TBD | — | — | J11.5 §A.3 | Seller marks items shipped (intra-Africa, no 20% release) |
| `confirmItemDelivery` | EtaloEscrow | ⏳ TBD | — | — | J11.5 §A.4 | Buyer confirms ; triggers commission split + seller payout + Reputation.recordCompletedOrder |
| `cancelOrder` | EtaloEscrow | ⏳ TBD | — | — | J11.5 §B.1 | Buyer cancels pre-fund (status == Created) |
| `openDispute` | EtaloDispute | ⏳ TBD | — | — | J11.5 §C.2 | Buyer opens dispute on funded order ; H-1 fix gate `require(order.fundedAt > 0)` enforced |
| `resolveN1Amicable` | EtaloDispute | ⏳ TBD | — | — | J11.5 §C.3 | Buyer + seller bilateral match ; internal `_applyResolution` → escrow.resolveItemDispute |
| `escalateToMediation` | EtaloDispute | ⏳ TBD | — | — | J11.5 §C.4 | N1 → N2 escalation ; assigns approved mediator |
| `resolveN2Mediation` | EtaloDispute | ⏳ TBD | — | — | J11.5 §C.5 | Assigned mediator decides refund + slash amount |
| `purchaseCredits` | EtaloCredits | ⏳ TBD | — | — | J11.5 §F.1 | Buyer buys N credits, USDT debited at 0.15/credit, transferred to creditsTreasury |

---

## §2 — Initialization audit trail (deploy + wiring, empirical)

These 25 transactions exercise the contract initialization sequence run by `deploy.v2.ts` + `deploy-credits.ts` post-H-1 redeploy. They are NOT user-flow samples but provide empirical evidence that the contract suite is correctly deployed + wired, useful for audit reviewers verifying deployment integrity.

### §2.1 Deploy txs (7)

| Contract | Address | Deploy tx | Block |
|---|---|---|---|
| MockUSDT | `0xea07db5d3D7576864ac434133abFE0E815735300` | [`0xea336bc1`...](https://celo-sepolia.blockscout.com/tx/0xea336bc1e5467dfc45dacacefe10147b1eb19a0620e90bbbf03d98f760f4d26f) | 24720376 |
| EtaloReputation | `0x539e0d44c0773504075E1B00f25A99ED70258178` | [`0xdd315dc4`...](https://celo-sepolia.blockscout.com/tx/0xdd315dc4162f797d029a26e919687af1623881a0fcf0c6fbb438390a3e40f842) | 24720379 |
| EtaloStake | `0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB` | [`0x974a61f0`...](https://celo-sepolia.blockscout.com/tx/0x974a61f07af0ee5a96beea16e2cceb4acb0809e941749e6c0d6a1db6f28b2842) | 24720383 |
| EtaloVoting | `0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A` | [`0x6248fe61`...](https://celo-sepolia.blockscout.com/tx/0x6248fe61521d09e0f0bec1bc903086cd0ff8847233339b477b79505361b6c8df) | 24720386 |
| EtaloDispute | `0xEe8339b29F54bd29d68E061c4212c8b202760F5b` | [`0x02268e68`...](https://celo-sepolia.blockscout.com/tx/0x02268e68b2d37da55264cccb7fd38faf782e7c3c6cd236fbed16c4b241890876) | 24720389 |
| EtaloEscrow | `0xAeC58270973A973e3FF4913602Db1b5c98894640` | [`0xf29c1b47`...](https://celo-sepolia.blockscout.com/tx/0xf29c1b47f8d74d65adc6fb059cd62850edf9a609ebefbd75d03fe4c078d300fe) | 24720393 |
| EtaloCredits | `0x778a6bda524F4D396F9566c0dF131F76b0E15CA3` | [`0xf5ae6be3`...](https://celo-sepolia.blockscout.com/tx/0xf5ae6be3dbfaa52c90531d58502d81ee1fe052056f034944f9fd0d083ea68077) | 24720520 |

### §2.2 Initial mint (1)

| Method | Contract | Tx | Notes |
|---|---|---|---|
| `mint(deployer, 10000 USDT)` | MockUSDT | [`0x81968444`...](https://celo-sepolia.blockscout.com/tx/0x819684440226f02bdcacd8e7092c7aee658d79d6d0e1486ac9550c9a154ef9f9) | 10 000 USDT minted to deployer at deploy time for testing convenience |

### §2.3 Wiring setters (17, grouped by target)

**Reputation auth (2)** — registers Escrow + Dispute as authorized callers for `recordCompletedOrder` / `recordDispute` :

| Method | Tx |
|---|---|
| `Reputation.setAuthorizedCaller(Escrow, true)` | [`0x1b8e79b1`...](https://celo-sepolia.blockscout.com/tx/0x1b8e79b16113649c7d80594b61a1e6542f73f330a236ebfd3f154f3293612e3d) |
| `Reputation.setAuthorizedCaller(Dispute, true)` | [`0xc6da0c2a`...](https://celo-sepolia.blockscout.com/tx/0xc6da0c2a9ab8f09c62812d0aaaef9652f54ce676c303f97943e6c5a436e6818e) |

**Stake wiring (4)** :

| Method | Tx |
|---|---|
| `Stake.setReputationContract` | [`0x14d70253`...](https://celo-sepolia.blockscout.com/tx/0x14d7025367cc2ff991bc0c216962b6733b19590b8e0970913cb334e0b5a115d8) |
| `Stake.setDisputeContract` | [`0x6a72102c`...](https://celo-sepolia.blockscout.com/tx/0x6a72102cc46bfdfcd65250c70b8700f4e971dfa21da1ea5fe469182d1311cf78) |
| `Stake.setEscrowContract` | [`0x4644acf4`...](https://celo-sepolia.blockscout.com/tx/0x4644acf4c5ddf41e22a415f38eaf685601dc639567b975a2be149a3b4f3ee40f) |
| `Stake.setCommunityFund` | [`0x5a150287`...](https://celo-sepolia.blockscout.com/tx/0x5a1502876b38138bdd0b74c8c690133d5e94ace6e100cf2de07dcc492ccddec7) |

**Voting wiring (1)** :

| Method | Tx |
|---|---|
| `Voting.setDisputeContract` | [`0x100864cd`...](https://celo-sepolia.blockscout.com/tx/0x100864cd7bafeebf104741be41e2c6e0e4e54a4880107e96385719aa1cc23e07) |

**Dispute wiring (4)** :

| Method | Tx |
|---|---|
| `Dispute.setEscrow` | [`0x9ad91945`...](https://celo-sepolia.blockscout.com/tx/0x9ad9194546681dac9ea20f64428c5e2b242471bef126291c2b37ec65805e143f) |
| `Dispute.setStake` | [`0x632d7a68`...](https://celo-sepolia.blockscout.com/tx/0x632d7a684112a2e8f3fc27d74140b3a46b91a047e538501972c395bab767de43) |
| `Dispute.setVoting` | [`0x461a9203`...](https://celo-sepolia.blockscout.com/tx/0x461a9203f3c22b493900a949bd6400407eef3b7c716a265187dc18ce93fad77d) |
| `Dispute.setReputation` | [`0xf6c59fe0`...](https://celo-sepolia.blockscout.com/tx/0xf6c59fe0bddb82d3e44dd31d81c21a239991e7d45c1f3a404d07606b707997c7) |

**Escrow wiring (6)** :

| Method | Tx |
|---|---|
| `Escrow.setDisputeContract` | [`0xdcf7cba1`...](https://celo-sepolia.blockscout.com/tx/0xdcf7cba18c3776c8af20251d19d3f2a96b667f873a30408667d578b916902042) |
| `Escrow.setStakeContract` | [`0xeeb88714`...](https://celo-sepolia.blockscout.com/tx/0xeeb887149c11f8ca285df52379fa0b1f4dd312b3b63ef435a1c3ca61119ebe55) |
| `Escrow.setReputationContract` | [`0xccc2d047`...](https://celo-sepolia.blockscout.com/tx/0xccc2d047b7a5927589088b9ee2c90ce82a81c7e209288656651a948a8cd5ad47) |
| `Escrow.setCommissionTreasury` | [`0x6d7a71cb`...](https://celo-sepolia.blockscout.com/tx/0x6d7a71cbd39b80bd2e22de678f40bf9c7e7fe0a4e99b9964e7b6bcd5f170c2d2) |
| `Escrow.setCreditsTreasury` | [`0x5ee4b0c5`...](https://celo-sepolia.blockscout.com/tx/0x5ee4b0c5db2ec40b34849ce2266927fbbae006f244590f1a57b37bd2d6c577cd) |
| `Escrow.setCommunityFund` | [`0x03dd30df`...](https://celo-sepolia.blockscout.com/tx/0x03dd30df634f302e9efd19409c6306e298ce8449c0034174466f650345c90e7e) |

---

## §3 — V1 admin + permissionless methods

These are exercisable by privileged or anyone-callable EOAs but are typically dormant in normal operation. Some (forceRefund, emergencyPause) require specific operational conditions to set up ; the smoke E2E will exercise them where reasonable, leaving the rest with documented "operational procedure" notes.

| Method | Contract | Status | Sample tx | Block | Smoke step | Notes |
|--------|----------|--------|-----------|-------|------------|-------|
| `triggerAutoReleaseForItem` | EtaloEscrow | ⏳ Time-bound | — | — | J11.5 §D.1 (deferred) | Permissionless trigger after 3-day intra-Africa auto-release timer (ADR-041). Sepolia has no `evm_increaseTime`, so the 3-day wait can't be compressed in a same-day smoke session. Surfaces post-mainnet via natural usage ; an async ops session (fund + ship today, run trigger in 3 days) can capture the tx if needed for V1.5+ audit. |
| `triggerAutoRefundIfInactive` | EtaloEscrow | ⏳ Time-bound | — | — | J11.5 §D.2 (deferred) | Permissionless trigger after 7-day intra-Africa seller-inactivity deadline (ADR-019). Same Sepolia time-advance constraint as D.1. |
| `emergencyPause` | EtaloEscrow | 🔒 Operational | — | — | J11.5 §E.1 (deferred) | Owner-only. Calling it locks Sepolia escrow for `EMERGENCY_PAUSE_MAX = 7 days` (ADR-026, hardcoded ; no manual unpause method). Running this in a smoke session would block all other Sepolia testing for a week. Reserved for first incident response with a tabletop exercise. |
| `registerLegalHold` | EtaloEscrow | ⏳ TBD | — | — | J11.5 §E.2 | Owner-only ; sets `legalHoldRegistry[orderId] = bytes32(documentHash)` for an order. Filled by smoke E2E orchestrator. |
| `forceRefund` | EtaloEscrow | 🔒 Operational | — | — | J11.5 §E.3 (deferred) | Owner-only. Requires the 3 ADR-023 conditions simultaneously : (1) dispute contract `address(0)`, (2) 90+ days order inactivity, (3) legal hold registered. The 90-day wait alone makes it non-reproducible live. Documented as operational procedure ; ADR-023 conditions are unit-tested in `Integration.v2.test.ts` scenario 11 on Hardhat fork. |

---

## §4 — V2-deferred (footer, intentional architecture)

The methods below are implemented in the V2 contract bytecode but **are not called in V1 mainnet operation** per ADR-041 (V1 scope restriction : intra-Africa only, single 1.8% commission rate, no cross-border, no stake, no Top Seller, no N3 voting). They will be exercised in the V1.5+ reactivation sprint when the corresponding surfaces are turned back on.

These entries are **not TBD** — their absence is a deliberate scoping decision, not a gap. The MiniPay listing reviewer will see this section as evidence of intentional surface area management.

### Cross-border lifecycle (deferred to V1.5+)

| Method | Contract | Status | Reactivation context |
|---|---|---|---|
| `shipItemsGrouped` (cross-border 20% release branch) | EtaloEscrow | 🔒 V2-deferred | ADR-018 progressive 20%/70%/10% — re-audit + sample tx post V1.5 cross-border re-enable |
| `markGroupArrived` | EtaloEscrow | 🔒 V2-deferred | Cross-border arrival proof step ; same |
| `triggerMajorityRelease` | EtaloEscrow | 🔒 V2-deferred | Cross-border 70% release at arrival + 72h dispute-free |
| `triggerAutoRefundIfInactive` (14-day cross-border branch) | EtaloEscrow | 🔒 V2-deferred | Same function as §3 D.2 above but the 14-day branch is cross-border-only |

### Stake module (deferred, contract not deployed V1)

V1 mainnet does not deploy `EtaloStake` (ADR-041). All methods below require the contract to be deployed, which happens in V1.5 with cross-border re-enable :

| Method | Contract | Status |
|---|---|---|
| `depositStake` | EtaloStake | 🔒 V2-deferred |
| `topUpStake` | EtaloStake | 🔒 V2-deferred |
| `upgradeTier` | EtaloStake | 🔒 V2-deferred |
| `initiateWithdrawal` | EtaloStake | 🔒 V2-deferred |
| `executeWithdrawal` | EtaloStake | 🔒 V2-deferred |
| `cancelWithdrawal` | EtaloStake | 🔒 V2-deferred |

### N3 community vote (deferred)

V1 mainnet keeps the dispute lifecycle at N1 (amicable) + N2 (mediator) per ADR-041 ; N3 community vote is implemented but disabled at the dispute-contract level :

| Method | Contract | Status |
|---|---|---|
| `escalateToVoting` | EtaloDispute | 🔒 V2-deferred (Dispute caller, V1 path stops at N2) |
| `submitVote` | EtaloVoting | 🔒 V2-deferred |
| `finalizeVote` | EtaloVoting | 🔒 V2-deferred |
| `resolveFromVote` | EtaloDispute (`onlyVoting`) | 🔒 V2-deferred (callback from voting, never invoked in V1) |

### Top Seller program (deferred to V1.1+)

| Method | Contract | Status | Reactivation context |
|---|---|---|---|
| `applySanction` (Top Seller cooldown context) | EtaloReputation | 🔒 V2-deferred | Sanction mechanic itself works V1 ; the Top Seller cooldown semantic activates in V1.1 with the badge program |
| `checkAndUpdateTopSeller` | EtaloReputation | 🔒 V2-deferred | Top Seller badge reactivation V1.1 |

---

## Audit checklist mapping

This document satisfies :
- **MiniPay listing prereq §3** : sample transaction per user-facing method (TBD entries flagged for J11.5 Block 8 smoke E2E fill, pre-J12 mainnet listing submission)
- **`docs/AUDIT_BRIEFING.md` §6** : empirical deployment evidence (§2 deploy + wiring trace, 25 txs)
- **`docs/SECURITY.md` Contract verification** : cross-link to source-verified contracts on Blockscout (per `docs/CELOSCAN_VERIFICATION.md`)
- **`docs/NETWORK_MANIFEST.md` audit checklist** : "Sample tx Celoscan per method" partially satisfied (V2-deferred completed, V1 active TBD)

---

## Time spent

Étape 0 + 1 : ~25 minutes (Blockscout queries + manifest/log parsing + structured doc).
