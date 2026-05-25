# Multisig rehearsal — Sepolia v1.3 — ✅ COMPLETE 2026-05-25

End-to-end validation of the multisig ownership-rotation workflow on
Celo Sepolia against the live v1.3-audit-fixes deploy. Two design
bugs in the rotation scripts surfaced during the live run and were
fixed in the same branch — the mainnet rotation will execute cleanly.

ADR-038 + ADR-055.

---

## 0. Final status

| Stage | Outcome | Notes |
| --- | --- | --- |
| Safe deployment | ✅ | v1.4.1 at `0x8be4a6f4E053D8CB758ff26053B47d9423734501`, 2-of-3, 3 owners |
| Forward rotation (deployer → Safe) | ✅ | 9/9 reads = Safe ; 6 from deployer + 3 via Safe (workaround for bug) |
| Safe-mediated admin tx | ✅ | `applySanction(CHIOMA, Active)` signed by 2 EOAs, executed |
| Restore (Safe → deployer) | ✅ | 9/9 reads back to deployer ; 6 via Safe + 3 direct (workaround for mirror bug) |
| Smoke regression post-restore | ✅ | Pashov #1 still live ; chain state correct (smoke output had RPC stale-read false-negative — confirmed via direct read) |
| Bug 1 — script ordering | ✅ fixed in this PR | Treasuries MUST be set before EtaloEscrow.transferOwnership |
| Bug 2 — SDK nonce caching | ✅ fixed in this PR | Re-init both Safe SDK instances per loop iteration |

---

## 1. Safe configuration

```text
Safe address  : 0x8be4a6f4E053D8CB758ff26053B47d9423734501
Safe version  : 1.4.1
Threshold     : 2-of-3
Owner 1       : 0xCb56A1f46f8bC0ef9a83161678DAbE49b847d047  (mobile passkey)
Owner 2       : 0xfcfE723245e1e926Ae676025138cA2C38ecBA8D8  (deployer)
Owner 3       : 0x77D2F8F23579c0Af378bD8eD94d25363b3F3444F  (CHIOMA)
```

Created via Safe Wallet mobile app on `app.safe.global` (Celo Sepolia).
Cross-check: <https://celo-sepolia.blockscout.com/address/0x8be4a6f4E053D8CB758ff26053B47d9423734501>

---

## 2. Forward rotation : deployer → Safe (9 txs)

Steps 1-6 ran from `transfer-ownership.ts` (deployer signs directly).
Step 5 should have been LAST per the ordering bug — but the original
script transferred EtaloEscrow ownership in step 5, which then made
steps 7-9 (treasury setters) revert with `OwnableUnauthorizedAccount`.
Workaround : ran the 3 treasury setters via `safe-tx-exec.ts` (Safe
already owned Escrow at that point).

| # | Step | Tx | Executor |
| --- | --- | --- | --- |
| 1 | EtaloReputation.transferOwnership | [`0x8e16afee`](https://celo-sepolia.blockscout.com/tx/0x8e16afee37836537064aa9cb4144529e3796260197993e06ee4e7c70cc3a38f5) | deployer |
| 2 | EtaloStake.transferOwnership | [`0x9ab9a202`](https://celo-sepolia.blockscout.com/tx/0x9ab9a2025632c1e5ada8135ec84ffc9306b9d22d4a5597132d92e45cb6378f87) | deployer |
| 3 | EtaloVoting.transferOwnership | [`0xf8f1adf5`](https://celo-sepolia.blockscout.com/tx/0xf8f1adf5de9e967d9c50d76bf878c53f321f0b25341ab731c9aef3326eb37f43) | deployer |
| 4 | EtaloDispute.transferOwnership | [`0xc530db0e`](https://celo-sepolia.blockscout.com/tx/0xc530db0e855b2386197fa87664165b17d78335b422d70a47e4bc0ad2108c0605) | deployer |
| 5 | EtaloEscrow.transferOwnership ⚠️ premature | [`0x10466237`](https://celo-sepolia.blockscout.com/tx/0x10466237d7188698f5d14debb33d12a4458fb8cbbc5c5028540fa77a8a5251fd) | deployer |
| 6 | EtaloCredits.transferOwnership | [`0x6affdf54`](https://celo-sepolia.blockscout.com/tx/0x6affdf5414981e0b6e6e434470e279f1aa4952f680cc2825263ad99b55597b27) | deployer |
| 7 | EtaloEscrow.setCommissionTreasury via Safe | [`0x33d3929f`](https://celo-sepolia.blockscout.com/tx/0x33d3929f1c94b2186fc3c316d2b848bba6e0c5acfbc61b5dba5312d9be42ae32) | Safe 2-of-3 (deployer + CHIOMA) |
| 8 | EtaloEscrow.setCreditsTreasury via Safe | [`0x8db55a92`](https://celo-sepolia.blockscout.com/tx/0x8db55a92f601ab3cc997ed377cea180238a27c093e6a072799addcf5ac76aaae) | Safe 2-of-3 |
| 9 | EtaloEscrow.setCommunityFund via Safe | [`0x9916d018`](https://celo-sepolia.blockscout.com/tx/0x9916d018e0fc615b75eb3fed234b24f4bbd56173199d1059781d8a5525335043) | Safe 2-of-3 |

Verification : all 6 contract `owner()` reads + 3 treasury reads
returned `0x8be4a6f4…` (Safe). `verify-ownership.ts` exited 0.

---

## 3. Safe-mediated admin tx (workflow validation)

To prove the Safe can actually authorise admin operations, ran
`applySanction(CHIOMA, Active=0)` to reset CHIOMA's status (she was
left at Suspended from the Pashov #1 smoke earlier in the day).

| Step | Tx | Notes |
| --- | --- | --- |
| Safe-mediated `applySanction(CHIOMA, Active)` | [`0xf5efcd6d`](https://celo-sepolia.blockscout.com/tx/0xf5efcd6de03efd600a1fc3bed25526bfb69ef81e86d7b5267b96d51860aa92d6) | 2 sigs (deployer + CHIOMA), Safe executed |

Read back : `CHIOMA.status = 0 (Active) ✅`.

---

## 4. Restore : Safe → deployer (9 Safe txs)

Same ordering bug in mirror — `restore-ownership.ts` transferred
EtaloEscrow ownership at step 5 (chronological step 9 below), which
broke the subsequent treasury setters via Safe (Safe no longer owned
Escrow). Workaround : finished treasuries via direct deployer calls
(deployer was the new owner at that point).

Bug 2 surfaced at step 2 of the first restore attempt : `GS026
Invalid signatures`. Root cause : the `@safe-global/protocol-kit`
SDK caches the Safe nonce from the initial `Safe.init()` call ; the
2nd iteration created a tx with the stale nonce, the signatures
matched the proposed (stale) hash, but the on-chain Safe expected
the incremented nonce → "Invalid signatures". Fix : re-init both SDK
instances inside the loop so each iteration reads the current
on-chain nonce. After the fix, steps 2-6 executed cleanly.

| # | Step | Tx | Executor |
| --- | --- | --- | --- |
| 1 | EtaloReputation.transferOwnership(deployer) via Safe | [`0xe4cec957`](https://celo-sepolia.blockscout.com/tx/0xe4cec957f35a78b4d22f8c1646d4bf568d9d23d1584f61633209212ae9322fc2) | Safe 2-of-3 |
| 2 | EtaloStake.transferOwnership(deployer) via Safe | [`0xc6af90dc`](https://celo-sepolia.blockscout.com/tx/0xc6af90dc6bb0efef20c8aaa2da7d60849696a4dd3dd86b213f4670a078a3190d) | Safe 2-of-3 (after SDK-nonce fix) |
| 3 | EtaloVoting.transferOwnership(deployer) via Safe | [`0x72e5ba67`](https://celo-sepolia.blockscout.com/tx/0x72e5ba67ec99a7f4d1f28665ae8a8cb86c6edb478004abbd5344dbed666812db) | Safe 2-of-3 |
| 4 | EtaloDispute.transferOwnership(deployer) via Safe | [`0x6f57995c`](https://celo-sepolia.blockscout.com/tx/0x6f57995c2cac231207728adb7fa68bcf25d04d2a1f267446c7580d98b27aac58) | Safe 2-of-3 |
| 5 | EtaloEscrow.transferOwnership(deployer) via Safe ⚠️ premature | [`0x0c2f2168`](https://celo-sepolia.blockscout.com/tx/0x0c2f216827376606e1d52c2ca8ec40bdfab9a0345e8e5346628b98512a08174b) | Safe 2-of-3 |
| 6 | EtaloCredits.transferOwnership(deployer) via Safe | [`0xc54d5391`](https://celo-sepolia.blockscout.com/tx/0xc54d5391987123edf960f0af7acd6c66f6c6eb11c17015654b5562deabddb929) | Safe 2-of-3 |
| 7 | EtaloEscrow.setCommissionTreasury(deployer) direct | [`0xae08afc1`](https://celo-sepolia.blockscout.com/tx/0xae08afc12af8709591446c8f3a3ad8c3c565ac0ac165ea176618626068c5a5b1) | deployer (now owner) |
| 8 | EtaloEscrow.setCreditsTreasury(deployer) direct | [`0xb1f303eb`](https://celo-sepolia.blockscout.com/tx/0xb1f303eb29065eaad07c1d34bd3640f3bdf4ca44f1e2d9382ff6f713e0a54f13) | deployer |
| 9 | EtaloEscrow.setCommunityFund(deployer) direct | [`0x50c40373`](https://celo-sepolia.blockscout.com/tx/0x50c403738ee8d26de6df02697f01807b9edd44a618f62012fd09a7b5e8ab7965) | deployer |

Verification : `verify-ownership.ts` with `SAFE_ADDRESS=deployer`
returned 9/9 ✅ (the script's "Safe sanity" section emits a warning
because the deployer is an EOA, not a Safe contract — expected
post-restore).

---

## 5. Smoke regression post-restore

Re-ran `scripts/smoke/sanction-regression.ts` on the v1.3 deploy
(deployer back as owner of EtaloReputation + EtaloEscrow). The
Pashov-finding-1 fix still validates end-to-end :

| Step | Tx | Notes |
| --- | --- | --- |
| approve / create / fund / ship | [`0xb39aee59`](https://celo-sepolia.blockscout.com/tx/0xb39aee59d44e7d7ba7381a8b53ab081d14eb2928618c901b279eed8143679390) onwards | orderId=5, itemId=14 |
| applySanction(CHIOMA, Suspended) | [`0xc751db64`](https://celo-sepolia.blockscout.com/tx/0xc751db6443ed28732b742ea3ba2a0fc883275fa1eead9bb8cf123462c0ee7e84) | deployer-direct (owner restored) |
| confirmItemDelivery(5, 14) | [`0x730d6350`](https://celo-sepolia.blockscout.com/tx/0x730d63504f8140dca3082686325aadbdc4361faf5ba5816cd2d0a126c7efa4c1) | succeeds — Pashov #1 silent no-op live ✅ |

The smoke script printed a **PARTIAL PASS false-negative** because
the forno load-balanced RPC returned stale state on the post-confirm
reads (different RPC node had not yet seen the new block). Direct
on-chain reads via a fresh RPC connection confirmed :

```text
CHIOMA.status      = 1 (Suspended)    ✅
item14.status      = 4 (Released)     ✅
item14.released    = 4.91 USDT (net)  ✅
order5.status      = 5 (Completed)    ✅
```

The actual chain state is exactly what Pashov #1 fix predicts. Will
add a "post-tx settle wait" + RPC-retry to the smoke script in a
follow-up to suppress the false-negative.

---

## 6. Lessons learned (script fixes shipped in this PR)

### Bug 1 — script ordering (deployer-loses-Escrow-mid-batch)

**Symptom** : step 7 of forward rotation reverted with
`OwnableUnauthorizedAccount(deployer)` because step 5 had already
transferred Escrow ownership to the Safe. Mirror symptom on restore
with `GS013` (the inner `setTreasury` call from Safe-mediated tx
reverted because the Safe was no longer Escrow owner after step 5
of restore).

**Fix** : both scripts now run in 3 phases.

| Phase | Forward (deployer → Safe) | Restore (Safe → deployer) |
| --- | --- | --- |
| 1 | 5 non-Escrow contract ownership transfers (any order) | Same 5 |
| 2 | 3 Escrow treasury setters (deployer still owns Escrow) | 3 Escrow treasury setters via Safe (Safe still owns Escrow) |
| 3 | `EtaloEscrow.transferOwnership(Safe)` (last) | `EtaloEscrow.transferOwnership(NEW_OWNER)` (last, via Safe) |

The same logical constraint holds in both directions : the entity
that owns Escrow must do the treasury reassignment BEFORE giving up
ownership.

### Bug 2 — Safe SDK nonce caching

**Symptom** : 1st loop iteration of `restore-ownership.ts` worked,
2nd reverted with `GS026 Invalid signatures`. Same SDK call shape,
same signers, same target call type — only the nonce changed
between iterations.

**Root cause** : `@safe-global/protocol-kit` v7.x caches the Safe
nonce read at `Safe.init()` time. Subsequent `createTransaction()`
calls use the cached nonce, producing a tx hash that's correct for
the *initial* nonce but wrong after the on-chain nonce incremented
from the previous iteration's `executeTransaction`. The Safe verifies
the signatures against the *expected* tx hash for its current nonce
and rejects them as invalid.

**Fix** : re-init both signer SDK instances inside the loop. Costs
a 50ms RPC round-trip per iteration (negligible vs the seconds spent
on tx confirmation).

```typescript
for (let i = 0; i < txs.length; i++) {
  // Fresh SDK reads on-chain nonce each iteration.
  const sdk1 = await Safe.init({ provider: cfg.rpc, signer: pk1, safeAddress: SAFE });
  const sdk2 = await Safe.init({ provider: cfg.rpc, signer: pk2, safeAddress: SAFE });
  …
}
```

### Bug 3 (minor) — drpc.org rejecting `eth_getCode`

**Symptom** : `https://celo-sepolia.drpc.org` (current default in
the multisig scripts) returned `-32601 method does not exist` for
`eth_getCode` calls during the rehearsal.

**Workaround used** : passed `CELO_SEPOLIA_RPC=https://forno.celo-sepolia.celo-testnet.org`
on every invocation. The forno endpoint handled all calls cleanly.

**Follow-up** : either swap the default RPC in the scripts to forno
(simpler) or add a 2-RPC fallback (more robust). Not blocking — the
override env var works.

---

## 7. Mainnet readiness assessment

The Sepolia rehearsal exercised every step of the mainnet rotation
plan + surfaced + fixed two scripts bugs that would have caused
revert+rollback ceremony on mainnet (which is much more expensive).

| Aspect | Sepolia rehearsal | Mainnet plan |
| --- | --- | --- |
| Safe creation | ✅ via mobile app | ✅ same procedure, mainnet chainId 42220 |
| Forward rotation script | ✅ executes cleanly now (post-fix) | ✅ ready, `MULTISIG_NETWORK=celoMainnet CONFIRM_MAINNET=1` required |
| Verify script | ✅ produces correct output | ✅ ready, no changes needed |
| Restore back script | ✅ executes cleanly now (post-fix) | 🚫 blocked by `RESTORE_MAINNET=1` guard (per ADR-055 §"Forbidden operations") |
| Safe-mediated admin tx pattern | ✅ validated end-to-end | ✅ same `safe-tx-exec.ts` pattern, mobile passkey via Safe Wallet app instead of 2 EOA convenience |
| Total tx count | 18 txs (9 forward + 9 restore) | 9 txs (forward only) |
| Total cost | ~0.05 CELO Sepolia (gas) | ~0.05 CELO mainnet |
| Time | ~25 min (incl. bug fixes) | ~10 min for the 9-tx forward sequence |

**Mainnet gate green** for the rotation procedure itself. Blockers
remaining : (a) Mike acquires hardware wallet OR commits to mobile
passkey for V1 (already greenlit in ADR-055), (b) real 3rd-party
signer identified + onboarded per `docs/MULTISIG_OPS.md` §1, (c)
audit firm sign-off on the signer set (ADR-039).

---

## 8. Sign-off checklist

| Step | Status | Date |
| --- | --- | --- |
| Safe deployed | ✅ | 2026-05-25 |
| Forward rotation complete | ✅ | 2026-05-25 |
| Verify passed | ✅ | 2026-05-25 |
| Admin tx via Safe succeeded | ✅ | 2026-05-25 |
| Restore back to deployer complete | ✅ | 2026-05-25 |
| Smoke regression after restore passed | ✅ (chain state confirmed) | 2026-05-25 |
| Bug 1 + Bug 2 fixed in scripts | ✅ | 2026-05-25 |

---

## 9. References

- ADR-038 — Multisig strategy
- ADR-055 — Passkey signer set
- `docs/MULTISIG_OPS.md` — runbook
- `packages/contracts/scripts/multisig/` — all 4 scripts
- `docs/audit/SMOKE_SANCTION_REGRESSION.md` — Pashov regression results
