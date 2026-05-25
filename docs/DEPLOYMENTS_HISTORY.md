# Etalo deployments history

Audit trail of all on-chain deploys across testnets and mainnet. The
canonical machine-readable source of the current active deploy is
`packages/contracts/deployments/<network>.json` ; this file is the
human-readable narrative chronology, with explicit `do_not_interact`
flags on deprecated addresses.

---

## Celo Sepolia

### V2 redeploy post-H-1 fix (2026-05-05, ADR-042)

**Active deploy.** Deployer `0xfcfE723245e1e926Ae676025138cA2C38ecBA8D8`.

| Contract | New address | Block | Old address (deprecated) | Reason |
|---|---|---|---|---|
| MockUSDT | `0xea07db5d3D7576864ac434133abFE0E815735300` | 24720376 | `0x5ce5eba46a72ea49655367c57334e038ea1aa1f3` | H-1 redeploy (fresh suite, V1 contamination avoided) |
| EtaloReputation | `0x539e0d44c0773504075E1B00f25A99ED70258178` | 24720379 | `0x2a6639074d0897c6280f55b252b97dd1c39820b7` | H-1 redeploy (paired with new Escrow) |
| EtaloStake | `0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB` | 24720383 | `0xbb21baa78f5b0c268ea66912ce8b3e76eb79c417` | H-1 redeploy (paired with new Escrow) |
| EtaloVoting | `0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A` | 24720386 | `0x335ac0998667f76fe265bc28e6989dc535a901e7` | H-1 redeploy (paired with new Dispute) |
| **EtaloDispute** | `0xEe8339b29F54bd29d68E061c4212c8b202760F5b` | 24720389 | `0x863f0bbc8d5873fe49f6429a8455236fe51a9abe` | **H-1 vulnerable** — `openDispute` lacked `require(order.fundedAt > 0)` |
| **EtaloEscrow** | `0xAeC58270973A973e3FF4913602Db1b5c98894640` | 24720393 | `0x6caebc6adc5082f6b63282e86caf51aebd630bfb` | **H-1 vulnerable** — `markItemDisputed` + `resolveItemDispute` lacked `require(order.fundedAt > 0)` |
| EtaloCredits | `0x778a6bda524F4D396F9566c0dF131F76b0E15CA3` | 24720520 | `0xb201a5F0D471261383F8aFbF07a9dc6584C7B60d` | H-1 redeploy (paired with new MockUSDT/treasury, ADR-037 hybrid contract unchanged functionally) |

**Deprecation note** : the pre-H-1 addresses are left alive on-chain.
Custody verified at 0 USDT on EtaloEscrow at deprecation time
(2026-05-05). No defensive drain executed because no real funds were
ever moved through those contracts (Mike's BigInteger preflight
blocker prevented any funded-order test before the H-1 fix landed).
**Do NOT interact with these addresses.** Frontend + backend +
indexer have been switched to the new addresses (commits in
`ops/sepolia-redeploy-h1-fix` branch).

**Tracking** : ADR-042, PR `fix/h1-dispute-funded-guard` (merged
2026-05-05), `docs/audit/PASHOV_AUDIT_EtaloDispute.md`,
`docs/audit/H1_POST_FIX_VERIFICATION.md`.

---

### H-1 redeploy attempt 1 (abandoned, 2026-05-05)

5 inert orphan contracts on-chain from the first deploy attempt that
ran out of gas at the EtaloEscrow step. Wallet `0xfcfE7...8D8` had
0.597 CELO at start ; insufficient for the full 6-contract sequence.
After faucet refill, attempt 2 (above) re-deployed 6 fresh addresses
from scratch and abandoned these 5.

| Contract | Orphan address | Block |
|---|---|---|
| MockUSDT | `0x3d588192bc76e38a3f6453e45a9b9ad0dc85bc9a` | 24719400 |
| EtaloReputation | `0xa1c48f2f962484d63d4d1b04c9c2574da2c0ecba` | 24719403 |
| EtaloStake | `0x6d5aa5e0eae407688e99492213849d9a608d63d2` | 24719407 |
| EtaloVoting | `0x0890d9bce4e71148b135a99cf501de52aa05ee92` | 24719410 |
| EtaloDispute | `0xddbe5bec28b4ec0a309fca87047750ef4b42f7d6` | 24719414 |

**Inert** : never wired to each other (Étape 2.3 wiring step never
ran), never minted USDT, never received any tx besides their own
construction. Custody = 0. Safe to ignore on-chain forever.

---

### Pre-H-1 vulnerable deploy (2026-04-24, deprecated 2026-05-05)

The original V2 deploy on Celo Sepolia. Deployer
`0x66bD37325cf41dAd0035398854f209785C9bC4C2` (different wallet from
the post-H-1 deployer — key rotation between deploy windows).

| Contract | Address | Block | Status |
|---|---|---|---|
| MockUSDT | `0x5ce5eba46a72ea49655367c57334e038ea1aa1f3` | 23761654 | Deprecated |
| EtaloReputation | `0x2a6639074d0897c6280f55b252b97dd1c39820b7` | 23761657 | Deprecated |
| EtaloStake | `0xbb21baa78f5b0c268ea66912ce8b3e76eb79c417` | 23761661 | Deprecated |
| EtaloVoting | `0x335ac0998667f76fe265bc28e6989dc535a901e7` | 23761664 | Deprecated |
| **EtaloDispute** | `0x863f0bbc8d5873fe49f6429a8455236fe51a9abe` | 23761668 | **DEPRECATED — H-1 vulnerable** |
| **EtaloEscrow** | `0x6caebc6adc5082f6b63282e86caf51aebd630bfb` | 23761672 | **DEPRECATED — H-1 vulnerable** |
| EtaloCredits | `0xb201a5F0D471261383F8aFbF07a9dc6584C7B60d` | 23948381 | Deprecated |

**Custody at deprecation** : 0 USDT (verified by JSON-RPC `balanceOf`
on EtaloEscrow). No production user funds were ever at risk.

**Lifecycle note** : The pre-H-1 deploy was used during Sprint J4-J9
internal testing (component dev + audit pass). Mike's MiniPay wallet
was funded with 1000 USDT on `0x5ce5eba...` MockUSDT but no
end-to-end checkout ever completed (BigInteger preflight blocker hit
every attempt). When the H-1 audit finding surfaced (Sprint J11
pre-audit, 2026-05-05), the contracts were redeployed with the
3-layer fundedAt guard before any production user touched the system.

---

## Celo mainnet

**Not deployed yet.** V1 mainnet target is Sprint J12+ (per ADR-041
intra-Africa-only scope) once :

1. ADR-039 freelance audit + AI-assisted review complete
2. V1-pruned binary built per SPEC `§0` overrides (drop cross-border +
   stake + Top Seller surfaces)
3. Multisig 2-of-3 Safe set up (ADR-038)
4. Test sellers re-staked on testnet, full E2E smoke green

Mainnet addresses will be appended here once deployed.

---

## V2 redeploy 5 — Celo Sepolia (Pashov audit fixes — 2026-05-25)

**Tag:** `v1.3-audit-fixes`
**ADR:** ADR-054 (Pashov findings #1, #2, #4, #5 fixed pre-mainnet)
**Block range:** 26416199 – 26416227
**Deployer:** 0xfcfE723245e1e926Ae676025138cA2C38ecBA8D8

| Contract         | Address                                    |
|------------------|--------------------------------------------|
| MockUSDT (V2)    | 0xd34428140Fc8D6Be523d9A14C4E215F5709f9427 |
| EtaloReputation  | 0x5762502acAA57744F0bC10b3f0fD2Cd59a16EFbE |
| EtaloStake       | 0xE599a167f0422D6700EC812c6b0f3c485379Ed05 |
| EtaloVoting      | 0x44E4Aafb22ac1Af3ea005EBa7384Fa310b6fA671 |
| EtaloDispute     | 0x1f830A47af07E2BE9Db2017C873Bd2eF7F98f4a1 |
| EtaloEscrow      | 0xc8174b1218fEbD7d49B982cB3f1De83e411FbEA1 |
| EtaloCredits (J7)| 0x778a6bda524F4D396F9566c0dF131F76b0E15CA3 _(unchanged)_ |

**Predecessor addresses (deprecated 2026-05-25, do_not_interact):**

| Contract         | Old address                                |
|------------------|--------------------------------------------|
| MockUSDT (V2)    | 0xea07db5d3D7576864ac434133abFE0E815735300 |
| EtaloReputation  | 0x539e0d44c0773504075E1B00f25A99ED70258178 |
| EtaloStake       | 0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB |
| EtaloVoting      | 0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A |
| EtaloDispute     | 0xEe8339b29F54bd29d68E061c4212c8b202760F5b |
| EtaloEscrow      | 0xAeC58270973A973e3FF4913602Db1b5c98894640 |

The 5 deprecated addresses still respond on chain (they were valid
Sepolia deploys from the H-1 redeploy 2026-05-05, ADR-042) but
**must not** be wired into any new frontend / indexer build — they
carry the four pre-fix bugs (Pashov #1, #2, #4, #5 — see
`assets/findings/etalo-pashov-ai-audit-report-20260525-105458.md`).
The frontend env `NEXT_PUBLIC_ESCROW_ADDRESS` and the backend
`packages/contracts/deployments/celo-sepolia-v2.json` carry the new
addresses post-merge.

EtaloCredits address is unchanged because the audit fixes did not
touch the EtaloCredits contract — the old J7 deploy stays active.

17/17 wiring sanity checks passed at deploy time
(`scripts/deploy.v2.ts`). 10,000 MockUSDT minted to deployer for
post-deploy smoke testing.

---

## V1 mainnet deploy — Celo mainnet (2026-05-25) 🚀

**Tag:** `v1.4-mainnet`
**ADR:** ADR-054 (Pashov audit fixes) + ADR-055-3 (shadow Mike multisig)
**Network:** Celo mainnet, chainId 42220
**Block range:** 67832966 – 67832987 (contracts) + 67834011 (Safe) + rotation block range
**Deployer:** `0xfcfE723245e1e926Ae676025138cA2C38ecBA8D8` (15 CELO funded)

### Etalo V2 contracts (all 6 owned by mainnet Safe)

| Contract        | Address                                    | Constructor |
|-----------------|--------------------------------------------|-------------|
| EtaloReputation | `0xaF890609a3B2AF6E1E2Ebf91267347133b5065AD` | _none_ |
| EtaloStake      | `0x3D588192BC76e38a3f6453E45A9B9aD0Dc85bc9A` | `usdt=real-USDT` |
| EtaloVoting     | `0xa1C48f2f962484D63D4D1b04C9c2574Da2C0EcBA` | _none_ |
| EtaloDispute    | `0x6d5Aa5e0EAE407688E99492213849D9a608D63d2` | _none_ |
| EtaloEscrow     | `0x0890D9bCE4E71148b135A99Cf501DE52Aa05Ee92` | `usdt=real-USDT` |
| EtaloCredits    | `0xDDbE5BEC28B4eC0a309fca87047750EF4b42F7d6` | `usdt=real-USDT, creditsTreasury=Safe, admin=deployer→Safe` |

USDT used = real Celo Tether (`0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`). No MockUSDT on mainnet.

All 6 contracts source-verified on Blockscout (`celo.blockscout.com`) + Sourcify (`sourcify.dev`). Etherscan path skipped (CELOSCAN_API_KEY not set, non-blocking since Blockscout is the canonical Etalo explorer per `docs/SECURITY.md`).

### Multisig 2-of-3 Safe

- **Safe address:** `0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F`
- **Safe version:** 1.4.1 (canonical SafeProxyFactory deployment, programmatic via @safe-global/protocol-kit v7)
- **Threshold:** 2-of-3
- **Owners:**
  - `0xCb56A1f46f8bC0ef9a83161678DAbE49b847d047` — Mike mobile passkey (Secure Enclave Android, Safe Wallet app)
  - `0xfcfE723245e1e926Ae676025138cA2C38ecBA8D8` — Deployer EOA (dual role : signer + ops gas payer)
  - `0x1B26f42Cc3b1e21AfE33756b9282a5514f030A12` — Cold recovery EOA (paper seed in 2 separate physical locations, never loaded on internet device)

Deployment tx : [`0x0335503f…`](https://celoscan.io/tx/0x0335503f89dccd5c1100f6ac650f42368b56598c3f20f3b3344cdc98e0ccb53e) (block 67834011).

### Ownership rotation (9 txs)

The transfer-ownership.ts script (with treasury-first ordering fix from PR #90) executed cleanly first-try on mainnet :

| # | Step | Tx |
|---|------|----|
| 1 | EtaloReputation.transferOwnership(Safe) | [`0x42ab0438`](https://celoscan.io/tx/0x42ab0438d34837082c23fd5225252b8b01ddd8533899090a7232f66232a9c03a) |
| 2 | EtaloStake.transferOwnership(Safe) | [`0xc4a6ea94`](https://celoscan.io/tx/0xc4a6ea94c0db0c9eb86b874bc5f0e6508b7ec64c391984fb0352ed62b68153d2) |
| 3 | EtaloVoting.transferOwnership(Safe) | [`0xef4c6a89`](https://celoscan.io/tx/0xef4c6a8992f01c829fb666fda52aef417cb23467dd44c46c6aa4bd070bae6e2c) |
| 4 | EtaloDispute.transferOwnership(Safe) | [`0x9d4e318c`](https://celoscan.io/tx/0x9d4e318cccb93854f55423975954448b6a51984231b04a83b99375dc0d431317) |
| 5 | EtaloCredits.transferOwnership(Safe) | [`0xb5877414`](https://celoscan.io/tx/0xb5877414186f076d6f727ceeac2e1a461cd8f08485be99edad9fa06db2ade5fc) |
| 6 | EtaloEscrow.setCommissionTreasury(Safe) | [`0x8b39287f`](https://celoscan.io/tx/0x8b39287fc45afcf87f4a8dff408fe404c72ffb3c81d984b6557f433f9094485b) |
| 7 | EtaloEscrow.setCreditsTreasury(Safe) | [`0x9dec8665`](https://celoscan.io/tx/0x9dec866579a598f18ffd19a89a445cab08847453e16569cff2228be866b6daa0) |
| 8 | EtaloEscrow.setCommunityFund(Safe) | [`0x68bac417`](https://celoscan.io/tx/0x68bac4172191b30e4cb561540b6b782111263c744fb2f23ce37aa0127b98c978) |
| 9 | EtaloEscrow.transferOwnership(Safe) | [`0x206160b2`](https://celoscan.io/tx/0x206160b2e594de87315650b7332c28098f71d5a0fee6cbdabde5fda4b18d88c4) |

Final verify : 9/9 reads = Safe ✅ (`verify-ownership.ts --network celoMainnet`).

### Treasury slots

All 3 EtaloEscrow treasury slots point to the Safe :

- `commissionTreasury` = Safe
- `creditsTreasury` = Safe
- `communityFund` = Safe

ADR-024 logical separation preserved off-chain — admin Safe tx routes revenue to dedicated sub-accounts in V1.1+ once accumulation justifies the split.

### Total cost

~2.5 CELO mainnet gas (deploy 6 contracts + 17 setters + Safe creation + 9 rotation txs). Deployer started at 15 CELO, finished at ~12.5 CELO.

### What's next

- Front-end env update : web `.env.production` + backend `app/config.py` mainnet addresses (separate PR, doesn't touch contracts)
- MiniPay listing submission (Stage 1 intake form per `docs/audit/PASHOV_FINDINGS_J12.md`)
- Audit firm engagement (ADR-039, in parallel)
- First real-USDT smoke (small order from Mike's MiniPay wallet to a test seller)
- Cold key seed phrase storage : confirm 2 physical copies in place per MULTISIG_OPS.md §1.5
