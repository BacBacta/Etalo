/**
 * smoke/scenario4.ts — Fraud → N2 mediation slash (Phase B #4).
 *
 * Seller: CHIOMA (Tier 1 Starter, 10 USDT stake)
 * Buyer:  MAMADOU  /  Mediator: MEDIATOR1 (approved)
 * 1 item × 80 USDT cross-border (commission 2.7%)
 *
 * Flow:
 *   0. DEPLOYER → MEDIATOR1: +0.05 CELO top-up
 *   A. MAMADOU: approve(escrow, 80) + create + fund
 *   B. CHIOMA: ship (20% = 15.568 net) + markGroupArrived
 *   C. MAMADOU: openDispute
 *   D. MAMADOU: escalateToMediation  → N2
 *   E. DEPLOYER: assignN2Mediator(MEDIATOR1)
 *   F. MEDIATOR1: resolveN2Mediation(refund=64.432, slash=5)
 *      → escrow.resolveItemDispute: 64.432 → MAMADOU
 *      → stake.slashStake: 5 → MAMADOU (recipient = buyer)
 *      → auto-downgrade 10 → 5 USDT, Tier.Starter(1) → Tier.None(0)
 *      → TierAutoDowngraded + StakeSlashed events
 *
 * Validates: Phases 6 (N2 with slash), 8 (auto-downgrade ADR-028),
 *            12 (Dispute → Stake slash pipeline).
 *
 * Note: item.status is Released (4) not Refunded (6), because the
 * contract's check is `refundAmount == itemPrice` (80), not
 * `refundAmount == remainingInEscrow` (64.432).
 */
import { keccak256, parseAbi, parseEther, toBytes } from "viem";
import {
  assertOrThrow,
  captureEventFromReceipt,
  computeBalanceDiffs,
  fromUsdt,
  loadDeployments,
  loadTestWallets,
  makePublicClient,
  makeWalletClient,
  safeRpcUrl,
  saveScenarioResult,
  sendTxWithEstimate,
  snapshotBalances,
  usdt,
  verifyAllEventsEmitted,
} from "./helpers.js";

const escrowAbi = parseAbi([
  "struct Order { uint256 orderId; address buyer; address seller; uint256 totalAmount; uint256 totalCommission; uint256 createdAt; uint256 fundedAt; bool isCrossBorder; uint8 globalStatus; uint256 itemCount; uint256 shipmentGroupCount; }",
  "struct Item { uint256 itemId; uint256 orderId; uint256 itemPrice; uint256 itemCommission; uint256 shipmentGroupId; uint256 releasedAmount; uint8 status; }",
  "function createOrderWithItems(address seller, uint256[] itemPrices, bool isCrossBorder) returns (uint256)",
  "function fundOrder(uint256 orderId)",
  "function shipItemsGrouped(uint256 orderId, uint256[] itemIds, bytes32 proofHash) returns (uint256)",
  "function markGroupArrived(uint256 orderId, uint256 groupId, bytes32 proofHash)",
  "function getOrderItems(uint256 orderId) view returns (uint256[])",
  "function getOrder(uint256 orderId) view returns (Order)",
  "function getItem(uint256 itemId) view returns (Item)",
  "event OrderCreated(uint256 indexed orderId, address indexed buyer, address indexed seller, uint256 totalAmount, bool isCrossBorder, uint256 itemCount)",
  "event OrderFunded(uint256 indexed orderId, uint256 fundedAt)",
  "event ShipmentGroupCreated(uint256 indexed orderId, uint256 indexed groupId, uint256[] itemIds, bytes32 proofHash)",
  "event GroupArrived(uint256 indexed orderId, uint256 indexed groupId, bytes32 arrivalProofHash, uint256 arrivedAt)",
  "event PartialReleaseTriggered(uint256 indexed orderId, uint256 indexed groupId, uint8 releaseStage, uint256 amount)",
  "event ItemDisputed(uint256 indexed orderId, uint256 indexed itemId)",
  "event ItemDisputeResolved(uint256 indexed orderId, uint256 indexed itemId, uint256 refundAmount)",
]);

const disputeAbi = parseAbi([
  "function openDispute(uint256 orderId, uint256 itemId, string reason) returns (uint256)",
  "function escalateToMediation(uint256 disputeId)",
  "function assignN2Mediator(uint256 disputeId, address med)",
  "function resolveN2Mediation(uint256 disputeId, uint256 refundAmount, uint256 slashAmount)",
  "event DisputeOpened(uint256 indexed disputeId, uint256 indexed orderId, uint256 indexed itemId, address buyer, string reason)",
  "event DisputeEscalated(uint256 indexed disputeId, uint8 newLevel)",
  "event MediatorAssigned(uint256 indexed disputeId, address indexed mediator)",
  "event DisputeResolved(uint256 indexed disputeId, bool favorBuyer, uint256 refundAmount, uint256 slashAmount)",
]);

const stakeAbi = parseAbi([
  "function getStake(address seller) view returns (uint256)",
  "function getTier(address seller) view returns (uint8)",
  "function getActiveSales(address seller) view returns (uint256)",
  "function getWithdrawal(address seller) view returns (uint256 amount, uint8 targetTier, uint256 unlockAt, uint256 frozenRemaining, bool active, uint256 freezeCount)",
  "event StakeSlashed(address indexed seller, uint256 amount, address indexed recipient, uint256 disputeId)",
  "event TierAutoDowngraded(address indexed seller, uint8 oldTier, uint8 newTier, uint256 remainingStake)",
]);

const reputationAbi = parseAbi([
  "struct SellerReputation { uint256 ordersCompleted; uint256 ordersDisputed; uint256 disputesLost; uint256 totalVolume; uint256 score; bool isTopSeller; uint8 status; uint256 lastSanctionAt; uint256 firstOrderAt; }",
  "function getReputation(address seller) view returns (SellerReputation)",
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
  const wDeployer = makeWalletClient(w.deployer);
  const wChioma = makeWalletClient(w.chioma);
  const wMamadou = makeWalletClient(w.mamadou);
  const wMediator1 = makeWalletClient(w.mediator1);

  console.log(`=== Scenario 4 — Fraud → N2 mediation slash ===`);
  console.log(`RPC:        ${safeRpcUrl()}`);
  console.log(`Seller:     CHIOMA     ${w.chioma.address}`);
  console.log(`Buyer:      MAMADOU    ${w.mamadou.address}`);
  console.log(`Mediator:   MEDIATOR1  ${w.mediator1.address}`);
  console.log(`Escrow:     ${dep.addresses.escrow}`);
  console.log(`Dispute:    ${dep.addresses.dispute}`);
  console.log(`Stake:      ${dep.addresses.stake}\n`);

  const watched = {
    chioma: w.chioma.address as `0x${string}`,
    mamadou: w.mamadou.address as `0x${string}`,
    mediator1: w.mediator1.address as `0x${string}`,
    treasury: dep.addresses.commissionTreasury,
    escrow: dep.addresses.escrow,
    stake: dep.addresses.stake,
    communityFund: dep.addresses.communityFund,
  };

  // Expected amounts
  const total = usdt(80);
  const commissionRate = 27n; // 2.7%
  const commissionTotal = (total * commissionRate) / 1000n; // 2.16
  const shipNet = (total * 20n * 973n) / (100n * 1000n); // 15.568
  const refundAmount = total - shipNet; // 64.432 = remainingInEscrow
  const slashAmount = usdt(5);
  const stakeBefore = usdt(10);
  const stakeAfter = stakeBefore - slashAmount; // 5 USDT

  console.log(`Expected (USDT):`);
  console.log(`  ship net:           +${fromUsdt(shipNet)} → CHIOMA`);
  console.log(`  dispute refund:     +${fromUsdt(refundAmount)} → MAMADOU (from escrow)`);
  console.log(`  slash:              +${fromUsdt(slashAmount)} → MAMADOU (from stake, victim recipient)`);
  console.log(`  total MAMADOU recv: +${fromUsdt(refundAmount + slashAmount)}`);
  console.log(`  MAMADOU net delta:  ${fromUsdt(-total + refundAmount + slashAmount)}`);
  console.log(`  stake delta:        ${fromUsdt(-slashAmount)}  (stake: ${fromUsdt(stakeBefore)} → ${fromUsdt(stakeAfter)})`);
  console.log(`  tier transition:    Starter(1) → None(0) since ${fromUsdt(stakeAfter)} < 10\n`);

  // ---------- Step 0: top-up MEDIATOR1 with 0.05 CELO ----------
  console.log(`--- Step 0: DEPLOYER → MEDIATOR1 +0.05 CELO ---`);
  const gasPrice = await pub.getGasPrice();
  const topupTx = await wDeployer.sendTransaction({
    to: w.mediator1.address as `0x${string}`,
    value: parseEther("0.05"),
    type: "legacy" as any, gasPrice, gas: 21_000n,
  } as any);
  await pub.waitForTransactionReceipt({ hash: topupTx });
  const medBal = await pub.getBalance({ address: w.mediator1.address as `0x${string}` });
  console.log(`  [OK] top-up tx=${topupTx}  MEDIATOR1 balance=${Number(medBal) / 1e18} CELO`);

  // ---------- Snapshot BEFORE ----------
  console.log(`\n--- Snapshot BEFORE ---`);
  const before = await snapshotBalances(pub, watched, dep.addresses.usdt);
  for (const [k, v] of Object.entries(before)) {
    console.log(`  ${k.padEnd(14)}  ${fromUsdt(v).toFixed(2)} USDT`);
  }
  const repBefore = (await pub.readContract({
    address: dep.addresses.reputation, abi: reputationAbi,
    functionName: "getReputation", args: [w.chioma.address],
  })) as { ordersCompleted: bigint; ordersDisputed: bigint; disputesLost: bigint };
  const stakeBeforeRead = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getStake", args: [w.chioma.address],
  })) as bigint;
  const tierBefore = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getTier", args: [w.chioma.address],
  })) as number;
  console.log(`  CHIOMA.stake=${fromUsdt(stakeBeforeRead)} tier=${tierBefore}`);
  console.log(`  CHIOMA.rep: completed=${repBefore.ordersCompleted} disputed=${repBefore.ordersDisputed} lost=${repBefore.disputesLost}`);

  // ---------- Step A: approve + create + fund ----------
  console.log(`\n--- Step A: MAMADOU approve + createOrder + fundOrder ---`);
  const txApprove = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.usdt, erc20Abi, "approve",
    [dep.addresses.escrow, total], "USDT.approve(escrow,80)",
  );
  const txCreate = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "createOrderWithItems",
    [w.chioma.address, [total], true], "createOrder(80,cross-border)",
  );
  const createdArgs = captureEventFromReceipt<any>(txCreate.receipt, "OrderCreated", escrowAbi);
  assertOrThrow(createdArgs !== null, "OrderCreated missing");
  const orderId = createdArgs!.orderId as bigint;
  const itemIds = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi,
    functionName: "getOrderItems", args: [orderId],
  })) as bigint[];
  const itemId = itemIds[0];
  console.log(`  → orderId=${orderId}  itemId=${itemId}`);
  const txFund = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "fundOrder",
    [orderId], `fundOrder(${orderId})`,
  );

  // ---------- Step B: ship + markArrived ----------
  console.log(`\n--- Step B: CHIOMA ship + markGroupArrived ---`);
  const shipProof = keccak256(toBytes("scenario4-ship-proof"));
  const txShip = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.escrow, escrowAbi, "shipItemsGrouped",
    [orderId, [itemId], shipProof], "shipItemsGrouped",
  );
  const shipArgs = captureEventFromReceipt<any>(txShip.receipt, "ShipmentGroupCreated", escrowAbi);
  const groupId = shipArgs!.groupId as bigint;
  const arrivalProof = keccak256(toBytes("scenario4-arrival-proof"));
  const txArrive = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.escrow, escrowAbi, "markGroupArrived",
    [orderId, groupId, arrivalProof], "markGroupArrived",
  );
  const afterShip = await snapshotBalances(pub, watched, dep.addresses.usdt);
  const shipDiffs = computeBalanceDiffs(before, afterShip);
  console.log(`  → groupId=${groupId}  CHIOMA ship delta=+${fromUsdt(shipDiffs.chioma)} USDT`);

  // ---------- Step C: openDispute ----------
  console.log(`\n--- Step C: MAMADOU openDispute(${orderId}, ${itemId}) ---`);
  const txOpenDispute = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.dispute, disputeAbi, "openDispute",
    [orderId, itemId, "Fake shipping proof — item never arrived"], "openDispute",
  );
  const disputeOpened = captureEventFromReceipt<any>(txOpenDispute.receipt, "DisputeOpened", disputeAbi);
  assertOrThrow(disputeOpened !== null, "DisputeOpened missing");
  const disputeId = disputeOpened!.disputeId as bigint;
  console.log(`  → disputeId=${disputeId}`);

  // ---------- Step D: escalateToMediation ----------
  console.log(`\n--- Step D: MAMADOU escalateToMediation(${disputeId}) ---`);
  const txEscalate = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.dispute, disputeAbi, "escalateToMediation",
    [disputeId], "escalateToMediation",
  );
  const escalated = captureEventFromReceipt<any>(txEscalate.receipt, "DisputeEscalated", disputeAbi);
  assertOrThrow(escalated !== null, "DisputeEscalated missing");
  assertOrThrow(escalated!.newLevel === 2, "Escalation should set level=2 (N2)",
    { actual: escalated!.newLevel, expected: 2 });

  // ---------- Step E: assignN2Mediator ----------
  console.log(`\n--- Step E: DEPLOYER assignN2Mediator(${disputeId}, MEDIATOR1) ---`);
  const txAssign = await sendTxWithEstimate(
    pub, wDeployer, dep.addresses.dispute, disputeAbi, "assignN2Mediator",
    [disputeId, w.mediator1.address], "assignN2Mediator(MEDIATOR1)",
  );
  const assigned = captureEventFromReceipt<any>(txAssign.receipt, "MediatorAssigned", disputeAbi);
  assertOrThrow(assigned !== null, "MediatorAssigned missing");

  // ---------- Step F: resolveN2Mediation ----------
  console.log(`\n--- Step F: MEDIATOR1 resolveN2Mediation(${disputeId}, refund=${fromUsdt(refundAmount)}, slash=${fromUsdt(slashAmount)}) ---`);
  const txResolve = await sendTxWithEstimate(
    pub, wMediator1, dep.addresses.dispute, disputeAbi, "resolveN2Mediation",
    [disputeId, refundAmount, slashAmount], "resolveN2Mediation",
  );

  const disputeResolved = captureEventFromReceipt<any>(txResolve.receipt, "DisputeResolved", disputeAbi);
  assertOrThrow(disputeResolved !== null, "DisputeResolved missing");
  const itemDisputeResolved = captureEventFromReceipt<any>(txResolve.receipt, "ItemDisputeResolved", escrowAbi);
  assertOrThrow(itemDisputeResolved !== null, "ItemDisputeResolved missing");
  const stakeSlashed = captureEventFromReceipt<any>(txResolve.receipt, "StakeSlashed", stakeAbi);
  assertOrThrow(stakeSlashed !== null, "StakeSlashed missing");
  const tierDowngraded = captureEventFromReceipt<any>(txResolve.receipt, "TierAutoDowngraded", stakeAbi);
  assertOrThrow(tierDowngraded !== null, "TierAutoDowngraded missing");
  console.log(`  → DisputeResolved favorBuyer=${disputeResolved!.favorBuyer} refund=${fromUsdt(disputeResolved!.refundAmount)} slash=${fromUsdt(disputeResolved!.slashAmount)}`);
  console.log(`  → StakeSlashed amount=${fromUsdt(stakeSlashed!.amount)} recipient=${stakeSlashed!.recipient}`);
  console.log(`  → TierAutoDowngraded oldTier=${tierDowngraded!.oldTier} → newTier=${tierDowngraded!.newTier}  remainingStake=${fromUsdt(tierDowngraded!.remainingStake)}`);

  // ---------- Snapshot AFTER ----------
  console.log(`\n--- Snapshot AFTER ---`);
  const after = await snapshotBalances(pub, watched, dep.addresses.usdt);
  for (const [k, v] of Object.entries(after)) {
    console.log(`  ${k.padEnd(14)}  ${fromUsdt(v).toFixed(2)} USDT`);
  }
  const diffs = computeBalanceDiffs(before, after);

  // ---------- On-chain reads post-slash ----------
  const stakeAfterRead = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getStake", args: [w.chioma.address],
  })) as bigint;
  const tierAfter = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getTier", args: [w.chioma.address],
  })) as number;
  const wdAfter = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getWithdrawal", args: [w.chioma.address],
  })) as readonly [bigint, number, bigint, bigint, boolean, bigint];

  // ---------- Assertions ----------
  console.log(`\n--- Assertions ---`);
  const failures: string[] = [];
  const dust = 2n;
  const absDiff = (a: bigint, b: bigint) => (a > b ? a - b : b - a);
  function check(label: string, cond: boolean, extra?: string) {
    if (cond) console.log(`  [OK]   ${label}${extra ? "  " + extra : ""}`);
    else { console.log(`  [FAIL] ${label}${extra ? "  " + extra : ""}`); failures.push(label); }
  }

  // Balance deltas
  check("CHIOMA delta = +shipNet (15.568)",
    absDiff(diffs.chioma, shipNet) <= dust,
    `actual=${fromUsdt(diffs.chioma)} expected=${fromUsdt(shipNet)}`);
  check("MAMADOU delta = −total + refund + slash (−10.568)",
    absDiff(diffs.mamadou, -total + refundAmount + slashAmount) <= dust,
    `actual=${fromUsdt(diffs.mamadou)} expected=${fromUsdt(-total + refundAmount + slashAmount)}`);
  check("commissionTreasury delta = 0 (item fully refunded)",
    absDiff(diffs.treasury, 0n) <= dust,
    `actual=${fromUsdt(diffs.treasury)}`);
  check("Escrow delta = 0 (passes through)",
    absDiff(diffs.escrow, 0n) <= dust,
    `actual=${fromUsdt(diffs.escrow)}`);
  check("Stake contract delta = −5 USDT (slashed)",
    absDiff(diffs.stake, -slashAmount) <= dust,
    `actual=${fromUsdt(diffs.stake)} expected=${fromUsdt(-slashAmount)}`);
  check("communityFund delta = 0 (slash → buyer direct)",
    absDiff(diffs.communityFund, 0n) <= dust,
    `actual=${fromUsdt(diffs.communityFund)}`);

  // On-chain state
  check("stake.getStake(CHIOMA) == 5 USDT (orphan)",
    stakeAfterRead === stakeAfter,
    `actual=${fromUsdt(stakeAfterRead)} expected=${fromUsdt(stakeAfter)}`);
  check("stake.getTier(CHIOMA) == None(0) (auto-downgrade)",
    Number(tierAfter) === 0,
    `tier=${tierAfter}`);
  check("freezeCount back to 0 (resumeWithdrawal on resolve)",
    wdAfter[5] === 0n,
    `freezeCount=${wdAfter[5]}`);

  // Order + item status
  const order = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi, functionName: "getOrder", args: [orderId],
  })) as { globalStatus: number };
  const item = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi, functionName: "getItem", args: [itemId],
  })) as { status: number; releasedAmount: bigint };
  // Note: refund != itemPrice (64.432 != 80), so status goes to Released(4), not Refunded(6)
  check("order.globalStatus == Completed(5)", Number(order.globalStatus) === 5,
    `status=${order.globalStatus}`);
  check("item.status == Released(4) (refund < itemPrice → not Refunded)",
    Number(item.status) === 4, `status=${item.status}`);

  // Events
  const allLogs = [
    ...txCreate.receipt.logs, ...txFund.receipt.logs, ...txShip.receipt.logs,
    ...txArrive.receipt.logs, ...txOpenDispute.receipt.logs, ...txEscalate.receipt.logs,
    ...txAssign.receipt.logs, ...txResolve.receipt.logs,
  ];
  const combined: any = { logs: allLogs };
  const escrowEvents = ["OrderCreated", "OrderFunded", "ShipmentGroupCreated", "PartialReleaseTriggered", "GroupArrived", "ItemDisputed", "ItemDisputeResolved"];
  const disputeEvents = ["DisputeOpened", "DisputeEscalated", "MediatorAssigned", "DisputeResolved"];
  const stakeEvents = ["StakeSlashed", "TierAutoDowngraded"];
  const evE = verifyAllEventsEmitted(combined, escrowEvents, escrowAbi);
  const evD = verifyAllEventsEmitted(combined, disputeEvents, disputeAbi);
  const evS = verifyAllEventsEmitted(combined, stakeEvents, stakeAbi);
  check(`escrow events (7)`, evE.missing.length === 0, `missing=[${evE.missing.join(",")}]`);
  check(`dispute events (4)`, evD.missing.length === 0, `missing=[${evD.missing.join(",")}]`);
  check(`stake events (2)`, evS.missing.length === 0, `missing=[${evS.missing.join(",")}]`);

  // Reputation
  const repAfter = (await pub.readContract({
    address: dep.addresses.reputation, abi: reputationAbi,
    functionName: "getReputation", args: [w.chioma.address],
  })) as { ordersCompleted: bigint; ordersDisputed: bigint; disputesLost: bigint };
  check("reputation.ordersDisputed += 1",
    repAfter.ordersDisputed - repBefore.ordersDisputed === 1n,
    `delta=${repAfter.ordersDisputed - repBefore.ordersDisputed}`);
  check("reputation.disputesLost += 1 (refund > 0)",
    repAfter.disputesLost - repBefore.disputesLost === 1n,
    `delta=${repAfter.disputesLost - repBefore.disputesLost}`);
  check("reputation.ordersCompleted delta = 0 (no normal release)",
    repAfter.ordersCompleted - repBefore.ordersCompleted === 0n,
    `delta=${repAfter.ordersCompleted - repBefore.ordersCompleted}`);

  // ---------- Save ----------
  const endedAt = new Date().toISOString();
  const result = {
    scenario: "4 — Fraud → N2 mediation slash",
    startedAt, endedAt,
    wallets: {
      seller: w.chioma.address, buyer: w.mamadou.address,
      mediator: w.mediator1.address, admin: w.deployer.address,
    },
    order: { orderId, itemId, groupId, disputeId, isCrossBorder: true, total },
    amounts: { shipNet, refundAmount, slashAmount, stakeBefore, stakeAfter },
    txs: {
      topupMediator: topupTx,
      approve: txApprove.hash, create: txCreate.hash, fund: txFund.hash,
      ship: txShip.hash, arrive: txArrive.hash,
      openDispute: txOpenDispute.hash, escalate: txEscalate.hash,
      assign: txAssign.hash, resolve: txResolve.hash,
    },
    gasUsed: {
      approve: txApprove.gasUsed, create: txCreate.gasUsed, fund: txFund.gasUsed,
      ship: txShip.gasUsed, arrive: txArrive.gasUsed,
      openDispute: txOpenDispute.gasUsed, escalate: txEscalate.gasUsed,
      assign: txAssign.gasUsed, resolve: txResolve.gasUsed,
    },
    balances: {
      before: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, fromUsdt(v)])),
      afterShip: Object.fromEntries(Object.entries(afterShip).map(([k, v]) => [k, fromUsdt(v)])),
      after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, fromUsdt(v)])),
      deltas: Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, fromUsdt(v)])),
    },
    stake: {
      before: { stake: fromUsdt(stakeBeforeRead), tier: tierBefore },
      after: { stake: fromUsdt(stakeAfterRead), tier: tierAfter },
      freezeCountAfter: wdAfter[5],
    },
    reputation: {
      before: {
        ordersCompleted: repBefore.ordersCompleted,
        ordersDisputed: repBefore.ordersDisputed,
        disputesLost: repBefore.disputesLost,
      },
      after: {
        ordersCompleted: repAfter.ordersCompleted,
        ordersDisputed: repAfter.ordersDisputed,
        disputesLost: repAfter.disputesLost,
      },
    },
    events: {
      missingEscrow: evE.missing,
      missingDispute: evD.missing,
      missingStake: evS.missing,
      tierDowngradeOldToNew: { old: tierDowngraded?.oldTier, new: tierDowngraded?.newTier },
      stakeSlashedRecipient: stakeSlashed?.recipient,
    },
    finalStatus: {
      orderGlobalStatus: Number(order.globalStatus),
      itemStatus: Number(item.status),
      itemReleasedAmount: fromUsdt(item.releasedAmount),
    },
    note: "item.status is Released(4), NOT Refunded(6), because contract checks refundAmount == itemPrice (80), not == remainingInEscrow (64.432). Slash recipient is buyer (victim), communityFund receives 0.",
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures,
  };
  const outPath = saveScenarioResult("scenario4", result);
  console.log(`\nSaved: ${outPath}`);

  if (failures.length) {
    console.error(`\n❌ Scenario 4 FAIL — ${failures.length} failures:`);
    for (const f of failures) console.error(`  - ${f}`);
    throw new Error(`Scenario 4 FAIL`);
  }
  console.log(`\n✅ Scenario 4 PASS`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
});
