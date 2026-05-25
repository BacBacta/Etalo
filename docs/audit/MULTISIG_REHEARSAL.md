# Multisig rehearsal — Sepolia v1.3 (template, to be filled in
during the live run)

**Goal :** validate the full multisig ownership-rotation workflow
end-to-end on Sepolia, against the live v1.3-audit-fixes deploy,
before executing the same rotation on mainnet. ADR-038 + ADR-055.

**Status :** ⏳ PENDING — Safe creation by Mike, then live execution.

---

## 0. Pre-conditions

- [x] All audit fixes ship_ed (PR #82 / #83 / #84 / #85 / #86 / #87).
- [x] Multisig scripts + docs ship_ed (PR #88).
- [x] ADR-055 published (passkey signer set accepted for V1).
- [ ] Mike installed Safe Wallet mobile app + passkey-bound account.
- [ ] Safe 2-of-3 deployed on Celo Sepolia. _Address to fill in §2._

---

## 1. Rehearsal vs mainnet — what's different

| Aspect | Sepolia rehearsal | Mainnet production |
| --- | --- | --- |
| Signer #1 | Mike mobile passkey (same as mainnet) | Mike mobile passkey |
| Signer #2 | **Deployer EOA** (so smoke scripts stay scriptable) | **Mike desktop EOA distinct from deployer** |
| Signer #3 | **CHIOMA test wallet** (so we can cosign without a real 3rd party for rehearsal) | **Real 3rd-party signer with SLA** |
| Restore back to deployer | ✅ supported via `restore-ownership.ts` for smoke ops | 🚫 forbidden (`RESTORE_MAINNET=1` guard) |
| Forfeit if a key compromised | None — testnet | Real-USDT exposure |

The Sepolia setup uses 2 of the 3 signer keys you already control
(deployer + CHIOMA), which means any 2-of-3 signature can be assembled
programmatically without driving the mobile passkey through a UI for
every test. That's intentional convenience for the rehearsal and
absolutely must NOT be replicated on mainnet.

---

## 2. Safe creation (Mike, mobile app)

1. Install Safe Wallet (App Store / Play Store / `app.safe.global`).
2. Create a new account → passkey-bound (Face ID / Touch ID).
3. Network : Celo Sepolia (chainId 11142220). If not present in the
   default list, add it manually : RPC `https://celo-sepolia.drpc.org`,
   explorer `https://celo-sepolia.blockscout.com`, symbol CELO.
4. "New Safe Account" → "Create new Safe".
5. **Owners (3) :**
   - Mike mobile passkey address (Safe Wallet shows it on screen)
   - `0xfcfE723245e1e926Ae676025138cA2C38ecBA8D8` (deployer, also
     `PRIVATE_KEY` in `packages/contracts/.env`)
   - `0x77D2F8F23579c0Af378bD8eD94d25363b3F3444F` (CHIOMA, also
     `TEST_CHIOMA_PK` in `packages/contracts/.env`)
6. **Threshold : 2**.
7. Confirm + sign the creation tx (gas paid in CELO Sepolia — Mike's
   mobile signer needs ~0.05 CELO ; if it's empty, send some from
   the deployer via a quick `viem` transfer or use a faucet).
8. **Once deployed**, copy the Safe address (`0x…`).

**Safe address (to fill in) :** `0x________________________________________`

Once filled in, set it as an env var (or use the inline `SAFE_ADDRESS=…`
prefix on every script invocation below) :

```bash
echo "SAFE_REHEARSAL_SEPOLIA=0x…" >> packages/contracts/.env
```

---

## 3. Dry run + pre-flight

```bash
cd packages/contracts

# Dry-run : prints the 9-step plan, verifies the Safe address has
# bytecode, confirms all 6 contracts are still owned by the deployer.
DRY_RUN=1 SAFE_ADDRESS=<safe> npx hardhat run \
  scripts/multisig/transfer-ownership.ts --network celoSepolia
```

**Expected output (key lines) :**

```
✅ Safe address has bytecode (NNNNN bytes) — looks like a deployed contract.

  Current owners (must all == deployer 0xfcfE…) :
    ✅ EtaloReputation      owner = 0xfcfE…
    ✅ EtaloStake           owner = 0xfcfE…
    ✅ EtaloVoting          owner = 0xfcfE…
    ✅ EtaloDispute         owner = 0xfcfE…
    ✅ EtaloEscrow          owner = 0xfcfE…
    ✅ EtaloCredits         owner = 0xfcfE…

  Current treasuries on EtaloEscrow (will be reassigned to Safe) :
    ✅ commissionTreasury   = 0x9819c9E1b4F634784fd9A286240ecACd297823fa
    ✅ creditsTreasury      = 0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA
    ✅ communityFund        = 0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6

--- Plan (9 txs total) ---
  1-6. <contract>.transferOwnership(Safe)
  7-9. EtaloEscrow.set<Treasury>(Safe)
```

If any pre-flight check fails, **stop** and investigate before
proceeding.

---

## 4. Live forward rotation : deployer → Safe

```bash
SAFE_ADDRESS=<safe> npx hardhat run \
  scripts/multisig/transfer-ownership.ts --network celoSepolia
```

Sends 9 txs sequentially from the deployer wallet. Each takes ~5-10 s
on Sepolia. The script aborts on any revert (containing partial state
to the failed step).

**Tx hash log (fill in after run) :**

| # | Step | Tx hash |
| --- | --- | --- |
| 1 | EtaloReputation.transferOwnership | `0x________` |
| 2 | EtaloStake.transferOwnership | `0x________` |
| 3 | EtaloVoting.transferOwnership | `0x________` |
| 4 | EtaloDispute.transferOwnership | `0x________` |
| 5 | EtaloEscrow.transferOwnership | `0x________` |
| 6 | EtaloCredits.transferOwnership | `0x________` |
| 7 | EtaloEscrow.setCommissionTreasury | `0x________` |
| 8 | EtaloEscrow.setCreditsTreasury | `0x________` |
| 9 | EtaloEscrow.setCommunityFund | `0x________` |

Machine-readable copy : `scripts/multisig/transfer-ownership-celoSepolia-result.json`.

---

## 5. Verify (Safe is now owner of all 9)

```bash
SAFE_ADDRESS=<safe> npx hardhat run \
  scripts/multisig/verify-ownership.ts --network celoSepolia
```

**Expected :** exit code 0, every line ✅.

```
=== Multisig ownership audit — Celo Sepolia ===
--- Safe sanity ---
  Safe owners (3) :
    - 0x… (mobile passkey)
    - 0xfcfE… (deployer)
    - 0x77D2… (CHIOMA)
  Threshold : 2-of-3
--- Contract ownership (must == Safe) ---
  ✅ EtaloReputation … owner = <safe>
  …
--- Treasury assignments on EtaloEscrow (must == Safe) ---
  ✅ commissionTreasury = <safe>
  …
✅ All 9 ownership / treasury reads match the Safe address.
```

---

## 6. Workflow validation : send a Safe-mediated admin tx

To prove the Safe can actually authorise admin operations, send a
benign `applySanction(CHIOMA, 0)` (i.e. set CHIOMA back to Active —
the prior smoke runs left her at Suspended). This exercises the full
2-of-3 sign + execute path.

The `safe-tx-exec.ts` helper takes a target call (encoded data) and
signs it with deployer + CHIOMA — bypassing the mobile passkey only
for rehearsal convenience.

```bash
# Encode applySanction(0x77D2…, 0) — status enum Active = 0
TARGET_DATA=$(node -e "import('viem').then(v => console.log(v.encodeFunctionData({abi:[{name:'applySanction',type:'function',inputs:[{type:'address'},{type:'uint8'}]}],functionName:'applySanction',args:['0x77D2F8F23579c0Af378bD8eD94d25363b3F3444F',0]})))")

SAFE_ADDRESS=<safe> \
TARGET_CONTRACT=0x5762502acAA57744F0bC10b3f0fD2Cd59a16EFbE \
TARGET_DATA="$TARGET_DATA" \
  npx hardhat run scripts/multisig/safe-tx-exec.ts --network celoSepolia
```

**Expected :** Safe tx assembled, 2 signatures collected (deployer
+ CHIOMA), broadcast succeeds. CHIOMA's `status` reads as `0`
(Active) post-execution.

**Tx hash (fill in) :** `0x________`

---

## 7. Restore ownership back to deployer (so smokes stay simple)

```bash
SAFE_ADDRESS=<safe> npx hardhat run \
  scripts/multisig/restore-ownership.ts --network celoSepolia
```

Builds 9 Safe txs (6 transferOwnership(deployer) + 3
setTreasury(<original-treasury-eoa>)), signs each with deployer +
CHIOMA, executes via the Safe. Total ~9 broadcast txs from CHIOMA
(she pays gas because deployer is the executor of executions
internally — see Safe SDK behaviour).

**Note :** treasury restoration uses `NEW_OWNER` for all three slots
(simple default). If you want the original treasury EOAs back, set
each via a manual `safe-tx-exec.ts` call with the right target
addresses (see `docs/SECURITY.md` for the original triple).

**Tx hash log (fill in) :**

| # | Step | Tx hash |
| --- | --- | --- |
| 1-6 | transferOwnership(deployer) | … |
| 7-9 | set<Treasury>(deployer or original) | … |

Final verify :

```bash
SAFE_ADDRESS=0xfcfE723245e1e926Ae676025138cA2C38ecBA8D8 \
  npx hardhat run scripts/multisig/verify-ownership.ts --network celoSepolia
```

(Should pass the 6 contract-owner checks ; the 3 treasury checks
will pass if `NEW_OWNER=deployer` was used everywhere, fail if
you reset to the original treasury EOAs — both are valid post-
rehearsal states.)

---

## 8. Smoke regression after rehearsal

After step 7 the deployer is owner again ; rerun any of the existing
smokes to confirm they still work :

```bash
npx hardhat run scripts/smoke/sanction-regression.ts --network celoSepolia
```

If green : the rehearsal was successful and smoke infrastructure is
intact.

---

## 9. Lessons learned (fill in during the run)

- Pain points :
- Workflow surprises :
- Suggested improvements for the mainnet run :
- Time spent : Safe creation = … min, transfer = … min, restore = … min

---

## 10. Sign-off

| Step | Status | Date |
| --- | --- | --- |
| Safe deployed | | |
| Forward rotation complete | | |
| Verify passed | | |
| Admin tx via Safe succeeded | | |
| Restore back to deployer complete | | |
| Smoke regression after restore passed | | |

---

## 11. References

- ADR-038 — Multisig strategy
- ADR-055 — Passkey signer set
- `docs/MULTISIG_OPS.md` — full runbook (signing, recovery, rotation)
- `packages/contracts/scripts/multisig/` — all rehearsal scripts
- `docs/audit/SMOKE_SANCTION_REGRESSION.md` — existing smoke results
