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
