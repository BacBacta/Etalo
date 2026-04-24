/**
 * smoke/recovery-stake.ts
 *
 * ⚠️  BLOCKED SCRIPT — DO NOT RUN ON V1 (CURRENT) CONTRACTS.
 *
 * This script attempts the ADR-028-intended post-slash recovery path:
 *   1. CHIOMA approve(stake, 5 USDT)
 *   2. CHIOMA topUpStake(5 USDT)        ← REVERTS: "Not staked"
 *   3. CHIOMA upgradeTier(Starter)
 *
 * Step 2 reverts on V1 because `topUpStake` requires `tier != None`,
 * which post-slash auto-downgraded sellers do not satisfy. See
 * ADR-033 in docs/DECISIONS.md for the gap analysis.
 *
 * V1.5 will relax `topUpStake` precondition from `tier != None` to
 * `stake > 0`. At that point this script becomes the acceptance test
 * for the patch: run it against a slashed-and-auto-downgraded seller
 * (e.g. the preserved CHIOMA fixture at Celo Sepolia with
 * stake = 5 USDT, tier = None) and expect a clean PASS.
 *
 * Until V1.5 ships, running this script on any V1 deployment will
 * (a) waste the approve tx (~46k gas), (b) fail at topUpStake with
 * "Not staked", (c) leave an unused allowance.
 *
 * Usage (V1.5 only):
 *   npx hardhat run scripts/smoke/recovery-stake.ts --network celoSepolia
 */
import { parseAbi } from "viem";
import {
  assertOrThrow,
  captureEventFromReceipt,
  fromUsdt,
  loadDeployments,
  loadTestWallets,
  makePublicClient,
  makeWalletClient,
  safeRpcUrl,
  saveScenarioResult,
  sendTxWithEstimate,
  usdt,
} from "./helpers.js";

const stakeAbi = parseAbi([
  "function topUpStake(uint256 amount)",
  "function upgradeTier(uint8 newTier)",
  "function getStake(address seller) view returns (uint256)",
  "function getTier(address seller) view returns (uint8)",
  "event StakeToppedUp(address indexed seller, uint256 amount, uint256 newStake)",
  "event StakeUpgraded(address indexed seller, uint8 oldTier, uint8 newTier, uint256 addedAmount)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

async function main() {
  const startedAt = new Date().toISOString();
  const dep = loadDeployments();
  const w = loadTestWallets();
  const pub = makePublicClient();
  const wChioma = makeWalletClient(w.chioma);

  console.log(`=== Recovery — Stake (CHIOMA: 5 orphan → 10 Starter) ===`);
  console.log(`RPC:   ${safeRpcUrl()}`);
  console.log(`Stake: ${dep.addresses.stake}`);
  console.log(`CHIOMA: ${w.chioma.address}\n`);

  const topUpAmount = usdt(5);

  // ---------- BEFORE ----------
  const stakeBefore = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getStake", args: [w.chioma.address],
  })) as bigint;
  const tierBefore = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getTier", args: [w.chioma.address],
  })) as number;
  const stakeContractBalBefore = (await pub.readContract({
    address: dep.addresses.usdt, abi: erc20Abi,
    functionName: "balanceOf", args: [dep.addresses.stake],
  })) as bigint;
  const chiomaBalBefore = (await pub.readContract({
    address: dep.addresses.usdt, abi: erc20Abi,
    functionName: "balanceOf", args: [w.chioma.address],
  })) as bigint;

  console.log(`--- BEFORE ---`);
  console.log(`  CHIOMA.stake:     ${fromUsdt(stakeBefore)} USDT  tier=${tierBefore} (0=None)`);
  console.log(`  CHIOMA.balance:   ${fromUsdt(chiomaBalBefore)} USDT`);
  console.log(`  Stake contract:   ${fromUsdt(stakeContractBalBefore)} USDT`);

  // ---------- Step 1: approve 5 USDT ----------
  console.log(`\n--- Step 1: CHIOMA approve(stake, 5 USDT) ---`);
  const txApprove = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.usdt, erc20Abi, "approve",
    [dep.addresses.stake, topUpAmount], "USDT.approve(stake,5)",
  );

  // ---------- Step 2: topUpStake(5) ----------
  console.log(`\n--- Step 2: CHIOMA topUpStake(5 USDT) ---`);
  const txTopUp = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.stake, stakeAbi, "topUpStake",
    [topUpAmount], "topUpStake(5)",
  );
  const topUpEvent = captureEventFromReceipt<any>(txTopUp.receipt, "StakeToppedUp", stakeAbi);
  assertOrThrow(topUpEvent !== null, "StakeToppedUp event missing");
  console.log(`  → amount=${fromUsdt(topUpEvent!.amount)} newStake=${fromUsdt(topUpEvent!.newStake)}`);

  // ---------- Step 3: upgradeTier(Starter) ----------
  console.log(`\n--- Step 3: CHIOMA upgradeTier(Starter=1) ---`);
  const txUpgrade = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.stake, stakeAbi, "upgradeTier",
    [1], "upgradeTier(Starter)",
  );
  const upgradeEvent = captureEventFromReceipt<any>(txUpgrade.receipt, "StakeUpgraded", stakeAbi);
  assertOrThrow(upgradeEvent !== null, "StakeUpgraded event missing");
  console.log(`  → oldTier=${upgradeEvent!.oldTier} → newTier=${upgradeEvent!.newTier}  addedAmount=${fromUsdt(upgradeEvent!.addedAmount)} (expected 0)`);

  // ---------- AFTER ----------
  const stakeAfter = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getStake", args: [w.chioma.address],
  })) as bigint;
  const tierAfter = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getTier", args: [w.chioma.address],
  })) as number;
  const stakeContractBalAfter = (await pub.readContract({
    address: dep.addresses.usdt, abi: erc20Abi,
    functionName: "balanceOf", args: [dep.addresses.stake],
  })) as bigint;
  const chiomaBalAfter = (await pub.readContract({
    address: dep.addresses.usdt, abi: erc20Abi,
    functionName: "balanceOf", args: [w.chioma.address],
  })) as bigint;

  console.log(`\n--- AFTER ---`);
  console.log(`  CHIOMA.stake:     ${fromUsdt(stakeAfter)} USDT  tier=${tierAfter} (1=Starter)`);
  console.log(`  CHIOMA.balance:   ${fromUsdt(chiomaBalAfter)} USDT  (delta ${fromUsdt(chiomaBalAfter - chiomaBalBefore)})`);
  console.log(`  Stake contract:   ${fromUsdt(stakeContractBalAfter)} USDT  (delta ${fromUsdt(stakeContractBalAfter - stakeContractBalBefore)})`);

  // ---------- Assertions ----------
  console.log(`\n--- Assertions ---`);
  const failures: string[] = [];
  function check(label: string, cond: boolean, extra?: string) {
    if (cond) console.log(`  [OK]   ${label}${extra ? "  " + extra : ""}`);
    else { console.log(`  [FAIL] ${label}${extra ? "  " + extra : ""}`); failures.push(label); }
  }

  check("stake.getStake(CHIOMA) == 10 USDT", stakeAfter === usdt(10),
    `actual=${fromUsdt(stakeAfter)}`);
  check("stake.getTier(CHIOMA) == Starter(1)", Number(tierAfter) === 1,
    `tier=${tierAfter}`);
  check("stake contract USDT balance = stakeBefore + 5",
    stakeContractBalAfter === stakeContractBalBefore + topUpAmount,
    `before=${fromUsdt(stakeContractBalBefore)} after=${fromUsdt(stakeContractBalAfter)} delta=${fromUsdt(stakeContractBalAfter - stakeContractBalBefore)}`);
  check("CHIOMA USDT balance decreased by 5 (topUp transfer)",
    chiomaBalAfter === chiomaBalBefore - topUpAmount,
    `delta=${fromUsdt(chiomaBalAfter - chiomaBalBefore)}`);
  check("StakeUpgraded.addedAmount == 0 (zero-delta upgrade)",
    upgradeEvent!.addedAmount === 0n,
    `addedAmount=${fromUsdt(upgradeEvent!.addedAmount)}`);
  check("StakeUpgraded.oldTier == 0 (None)", Number(upgradeEvent!.oldTier) === 0,
    `oldTier=${upgradeEvent!.oldTier}`);
  check("StakeUpgraded.newTier == 1 (Starter)", Number(upgradeEvent!.newTier) === 1,
    `newTier=${upgradeEvent!.newTier}`);

  // ---------- Save ----------
  const endedAt = new Date().toISOString();
  const result = {
    note: "recovery operation between scenarios 4 and 5, validates ADR-028 topUpStake + upgradeTier-with-zero-delta paths (paths covered by unit tests Block 4/5, now observed on real network)",
    startedAt, endedAt,
    chioma: w.chioma.address,
    txs: {
      approve: txApprove.hash,
      topUpStake: txTopUp.hash,
      upgradeTier: txUpgrade.hash,
    },
    gasUsed: {
      approve: txApprove.gasUsed,
      topUpStake: txTopUp.gasUsed,
      upgradeTier: txUpgrade.gasUsed,
    },
    stake: {
      before: { amount: fromUsdt(stakeBefore), tier: tierBefore },
      after: { amount: fromUsdt(stakeAfter), tier: tierAfter },
      contractBalance: {
        before: fromUsdt(stakeContractBalBefore),
        after: fromUsdt(stakeContractBalAfter),
      },
    },
    events: {
      StakeToppedUp: {
        amount: fromUsdt(topUpEvent!.amount),
        newStake: fromUsdt(topUpEvent!.newStake),
      },
      StakeUpgraded: {
        oldTier: upgradeEvent!.oldTier,
        newTier: upgradeEvent!.newTier,
        addedAmount: fromUsdt(upgradeEvent!.addedAmount),
      },
    },
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures,
  };
  const outPath = saveScenarioResult("recovery-stake", result);
  console.log(`\nSaved: ${outPath}`);

  if (failures.length) {
    console.error(`\n❌ Recovery stake FAIL — ${failures.length} failures`);
    for (const f of failures) console.error(`  - ${f}`);
    throw new Error("Recovery FAIL");
  }
  console.log(`\n✅ Recovery stake PASS`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
});
