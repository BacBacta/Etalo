# Celoscan / Blockscout Verification — Sepolia V2 (post-H-1)

**Date** : 2026-05-06
**Bundle** : ADR-042 H-1 fix + V2 redeploy (PR #7 + #8 merged)
**Verification target** : `https://celo-sepolia.blockscout.com` (canonical Etalo explorer)
**MiniPay listing prereq** : §3 (per `minipay-requirements.md`)
**Branch** : `ops/celoscan-verify-h1-redeploy`

---

## Verified contracts (7/7) ✓

All 7 contracts deployed post-H-1 redeploy on Celo Sepolia are now source-verified on Blockscout (canonical) + Sourcify (auto-pickup via Blockscout metadata push). The Celoscan/Etherscan path was attempted but skipped due to a missing `CELOSCAN_API_KEY` config variable — see §Notes below ; this is acceptable because Blockscout is the explorer Etalo references in `docs/SECURITY.md`, `docs/AUDIT_BRIEFING.md`, and CLAUDE.md key-addresses cross-links.

| Contract | Address | Block | Source-verified | Method | Compiler |
|---|---|---|---|---|---|
| MockUSDT | `0xea07db5d3D7576864ac434133abFE0E815735300` | 24720376 | ✓ Blockscout + Sourcify | `hardhat verify` | `v0.8.24+commit.e11b9ed9` |
| EtaloReputation | `0x539e0d44c0773504075E1B00f25A99ED70258178` | 24720379 | ✓ Blockscout + Sourcify | `hardhat verify` | `v0.8.24+commit.e11b9ed9` |
| EtaloStake | `0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB` | 24720383 | ✓ Blockscout + Sourcify | `hardhat verify` | `v0.8.24+commit.e11b9ed9` |
| EtaloVoting | `0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A` | 24720386 | ✓ Blockscout + Sourcify | `hardhat verify` | `v0.8.24+commit.e11b9ed9` |
| **EtaloDispute** | `0xEe8339b29F54bd29d68E061c4212c8b202760F5b` | 24720389 | ✓ Blockscout + Sourcify | `hardhat verify` | `v0.8.24+commit.e11b9ed9` |
| **EtaloEscrow** | `0xAeC58270973A973e3FF4913602Db1b5c98894640` | 24720393 | ✓ Blockscout + Sourcify | `hardhat verify` | `v0.8.24+commit.e11b9ed9` |
| EtaloCredits | `0x778a6bda524F4D396F9566c0dF131F76b0E15CA3` | 24720520 | ✓ Blockscout + Sourcify | `hardhat verify` | `v0.8.24+commit.e11b9ed9` |

Bold rows = P0 (high financial impact, primary audit targets).

---

## Verification commands used

For reproducibility. All commands run from `packages/contracts/` after `pnpm exec hardhat compile`.

### P0 — financial-critical (verify first)

```bash
pnpm exec hardhat verify --network celoSepolia \
  0xAeC58270973A973e3FF4913602Db1b5c98894640 \
  "0xea07db5d3D7576864ac434133abFE0E815735300"
# EtaloEscrow — constructor: mockUsdt
```

```bash
pnpm exec hardhat verify --network celoSepolia \
  0xEe8339b29F54bd29d68E061c4212c8b202760F5b
# EtaloDispute — no constructor args
```

### P1 — paired with Escrow

```bash
pnpm exec hardhat verify --network celoSepolia \
  0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB \
  "0xea07db5d3D7576864ac434133abFE0E815735300"
# EtaloStake — constructor: mockUsdt
```

```bash
pnpm exec hardhat verify --network celoSepolia \
  0x778a6bda524F4D396F9566c0dF131F76b0E15CA3 \
  "0xea07db5d3D7576864ac434133abFE0E815735300" \
  "0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA" \
  "0xfcfE723245e1e926Ae676025138cA2C38ecBA8D8"
# EtaloCredits — constructor: mockUsdt, creditsTreasury, admin
```

### P2 — non-fund-moving

```bash
pnpm exec hardhat verify --network celoSepolia \
  0x539e0d44c0773504075E1B00f25A99ED70258178
# EtaloReputation — no constructor args
```

```bash
pnpm exec hardhat verify --network celoSepolia \
  0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A
# EtaloVoting — no constructor args
```

### P3 — test fixture

```bash
pnpm exec hardhat verify --network celoSepolia \
  0xea07db5d3D7576864ac434133abFE0E815735300
# MockUSDT — no constructor args
```

---

## Cross-check links (Blockscout)

| Contract | Blockscout source page |
|---|---|
| MockUSDT | https://celo-sepolia.blockscout.com/address/0xea07db5d3D7576864ac434133abFE0E815735300?tab=contract |
| EtaloReputation | https://celo-sepolia.blockscout.com/address/0x539e0d44c0773504075E1B00f25A99ED70258178?tab=contract |
| EtaloStake | https://celo-sepolia.blockscout.com/address/0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB?tab=contract |
| EtaloVoting | https://celo-sepolia.blockscout.com/address/0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A?tab=contract |
| EtaloDispute | https://celo-sepolia.blockscout.com/address/0xEe8339b29F54bd29d68E061c4212c8b202760F5b?tab=contract |
| EtaloEscrow | https://celo-sepolia.blockscout.com/address/0xAeC58270973A973e3FF4913602Db1b5c98894640?tab=contract |
| EtaloCredits | https://celo-sepolia.blockscout.com/address/0x778a6bda524F4D396F9566c0dF131F76b0E15CA3?tab=contract |

---

## Cross-check links (Sourcify, auto-pickup)

Sourcify cross-links via `sourcify.dev/server/repo-ui/<chainId>/<address>` — chainId for Celo Sepolia = `11142220`.

| Contract | Sourcify page |
|---|---|
| MockUSDT | https://sourcify.dev/server/repo-ui/11142220/0xea07db5d3D7576864ac434133abFE0E815735300 |
| EtaloReputation | https://sourcify.dev/server/repo-ui/11142220/0x539e0d44c0773504075E1B00f25A99ED70258178 |
| EtaloStake | https://sourcify.dev/server/repo-ui/11142220/0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB |
| EtaloVoting | https://sourcify.dev/server/repo-ui/11142220/0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A |
| EtaloDispute | https://sourcify.dev/server/repo-ui/11142220/0xEe8339b29F54bd29d68E061c4212c8b202760F5b |
| EtaloEscrow | https://sourcify.dev/server/repo-ui/11142220/0xAeC58270973A973e3FF4913602Db1b5c98894640 |
| EtaloCredits | https://sourcify.dev/server/repo-ui/11142220/0x778a6bda524F4D396F9566c0dF131F76b0E15CA3 |

---

## hardhat.config.ts patch

To enable verification routing for Celo Sepolia (chainId 11142220), the `verify` block was extended with a `customChains` entry pointing at the Celoscan Sepolia API URL :

```ts
verify: {
  etherscan: {
    apiKey: configVariable("CELOSCAN_API_KEY"),
    enabled: true,
  },
  customChains: [
    {
      network: "celoSepolia",
      chainId: 11142220,
      urls: {
        apiURL: "https://api-sepolia.celoscan.io/api",
        browserURL: "https://sepolia.celoscan.io",
      },
    },
  ],
},
```

The `customChains` entry directs Etherscan-style verification flow to Celoscan. Hardhat-verify v3 in this workspace runs three flows in parallel (Etherscan, Blockscout, Sourcify) and considers a contract verified if at least one succeeds.

---

## Notes

### Celoscan/Etherscan path skipped (missing API key)

The `hardhat verify` command outputs include `HHE7: Configuration Variable "CELOSCAN_API_KEY" not found` for each contract. The Celoscan/Etherscan verification path requires a `CELOSCAN_API_KEY` to be discoverable by Hardhat 3's `configVariable` system. At the time of this verification sweep the key was not present in `packages/contracts/.env` (verified by case-insensitive grep returning 0 matches). The `dotenv/config` import at the top of `hardhat.config.ts` does load `.env` into `process.env`, but `configVariable("CELOSCAN_API_KEY")` may use Hardhat's own keystore mechanism rather than `process.env` — this is a Hardhat 3 design choice not investigated here.

This is **non-blocking** : Blockscout is the canonical Etalo explorer (referenced in CLAUDE.md key-addresses, `docs/SECURITY.md` deployment artifacts table, `docs/AUDIT_BRIEFING.md` §6) and Blockscout verification succeeded without API key for all 7 contracts. Sourcify auto-pickup follows from Blockscout's metadata push, giving 2-of-3 explorer coverage. The 3rd (Celoscan) can be added later if needed by either :

1. Setting `CELOSCAN_API_KEY` in `packages/contracts/.env` AND re-running the 7 commands above, OR
2. Using `npx hardhat keystore set CELOSCAN_API_KEY` (Hardhat 3 keystore plugin) AND re-running.

### Compiler version consistency

All 7 contracts compile with `v0.8.24+commit.e11b9ed9` (Solidity 0.8.24, optimizer enabled with 200 runs per `hardhat.config.ts` default profile). Blockscout's `is_verified=true` confirms the on-chain bytecode matches the source compiled with these settings — including the H-1 fix in EtaloDispute (3-layer `require(order.fundedAt > 0)`) and EtaloEscrow.

### Verification API rate limits

Blockscout Sepolia did not rate-limit during this sweep (7 contracts in ~3 minutes). Sourcify "already verified" / "already being verified" responses are normal when the same submission arrives via multiple paths in close succession (Hardhat-verify pushes to all 3 explorers in parallel).

---

## Audit checklist mapping

This document satisfies :
- **MiniPay listing prereq §3** (smart contracts source-verified on canonical explorer)
- **`docs/AUDIT_BRIEFING.md` §6 Deployment artifacts** (cross-explorer redundancy goal — 2/3 met, Celoscan optional)
- **`docs/SECURITY.md` Contract verification** triple-explorer goal — Blockscout + Sourcify covered, Celoscan defer to follow-up
- **`docs/NETWORK_MANIFEST.md` audit checklist** (smart contracts source-verified on Blockscout, audited 2026-05-06)

---

## Time spent

~10 minutes (well under the 35-40 min estimate). Hardhat-verify v3 multi-explorer parallel push is significantly faster than sequential per-explorer verification in v2.

---

**End of verification sweep.** All 7 V2 post-H-1 contracts are source-verified on Blockscout and Sourcify. MiniPay listing prereq §3 satisfied.
