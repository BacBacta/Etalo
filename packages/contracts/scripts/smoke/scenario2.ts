/**
 * smoke/scenario2.ts — Cross-border 20% + buyer confirm (Phase B #2).
 *
 * Seller: CHIOMA (Tier 1 Starter stake 10 USDT)
 * Buyer:  MAMADOU (diaspora)
 * 1 item × 80 USDT cross-border (commission 2.7%)
 *
 * Flow:
 *   A. CHIOMA: approve(stake, 10) → depositStake(Starter)
 *   B. MAMADOU: approve(escrow, 80) → createOrderWithItems(CHIOMA, [80], true)
 *               → fundOrder
 *   C. CHIOMA: shipItemsGrouped (auto 20% net release — commission
 *              stays in escrow until final)
 *   D. CHIOMA: markGroupArrived(orderId, groupId, arrivalProofHash)
 *   E. MAMADOU: confirmItemDelivery — releases remaining 80% + commission
 *
 * Validates: Phases 1 (cross-border stake gate), 3 (20% release), 4
 *            (arrival), 5 (buyer confirm), 8 (stake), 12 (Escrow↔Stake).
 */
import { keccak256, parseAbi, toBytes } from "viem";
import {
  assertOrThrow,
  captureAllEventsFromReceipt,
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
  "function confirmItemDelivery(uint256 orderId, uint256 itemId)",
  "function getOrderItems(uint256 orderId) view returns (uint256[])",
  "function getOrder(uint256 orderId) view returns (Order)",
  "function getItem(uint256 itemId) view returns (Item)",
  "event OrderCreated(uint256 indexed orderId, address indexed buyer, address indexed seller, uint256 totalAmount, bool isCrossBorder, uint256 itemCount)",
  "event OrderFunded(uint256 indexed orderId, uint256 fundedAt)",
  "event ShipmentGroupCreated(uint256 indexed orderId, uint256 indexed groupId, uint256[] itemIds, bytes32 proofHash)",
  "event GroupArrived(uint256 indexed orderId, uint256 indexed groupId, bytes32 arrivalProofHash, uint256 arrivedAt)",
  "event PartialReleaseTriggered(uint256 indexed orderId, uint256 indexed groupId, uint8 releaseStage, uint256 amount)",
  "event ItemReleased(uint256 indexed orderId, uint256 indexed itemId, uint256 amount)",
  "event ItemCompleted(uint256 indexed orderId, uint256 indexed itemId)",
  "event OrderCompleted(uint256 indexed orderId)",
]);

const stakeAbi = parseAbi([
  "function depositStake(uint8 tier)",
  "function getStake(address seller) view returns (uint256)",
  "function getTier(address seller) view returns (uint8)",
  "event StakeDeposited(address indexed seller, uint256 amount, uint8 tier)",
]);

const reputationAbi = parseAbi([
  "struct SellerReputation { uint256 ordersCompleted; uint256 ordersDisputed; uint256 disputesLost; uint256 totalVolume; uint256 score; bool isTopSeller; uint8 status; uint256 lastSanctionAt; uint256 firstOrderAt; }",
  "function getReputation(address seller) view returns (SellerReputation)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

// Constants from contract (SPEC §4, ADR-018):
//   intra_commission_bp = 180  (1.8%)
//   crossborder_commission_bp = 270  (2.7%)
//   shipping_release_pct = 20  (20% at ship, cross-border only)
//   stake_starter = 10 USDT (ADR-020)

async function main() {
  const startedAt = new Date().toISOString();
  const dep = loadDeployments();
  const w = loadTestWallets();
  const pub = makePublicClient();
  const wChioma = makeWalletClient(w.chioma);
  const wMamadou = makeWalletClient(w.mamadou);

  console.log(`=== Scenario 2 — Cross-border 20% + buyer confirm ===`);
  console.log(`RPC:     ${safeRpcUrl()}`);
  console.log(`Seller:  CHIOMA   ${w.chioma.address}`);
  console.log(`Buyer:   MAMADOU  ${w.mamadou.address}`);
  console.log(`Stake:   ${dep.addresses.stake}`);
  console.log(`Escrow:  ${dep.addresses.escrow}\n`);

  const watchedAddrs = {
    chioma: w.chioma.address as `0x${string}`,
    mamadou: w.mamadou.address as `0x${string}`,
    treasury: dep.addresses.commissionTreasury,
    escrow: dep.addresses.escrow,
    stake: dep.addresses.stake,
  };

  const stakeAmount = usdt(10);
  const total = usdt(80);
  const commissionExpected = (total * 27n) / 1000n; // 2.7% cross-border
  const sellerNetExpected = total - commissionExpected;
  const shipReleaseNet = (total * 20n * 973n) / (100n * 1000n); // 20% × 97.3% net
  const confirmReleaseNet = sellerNetExpected - shipReleaseNet;

  // ---------- Snapshot BEFORE ----------
  console.log(`--- Snapshot BEFORE ---`);
  const before = await snapshotBalances(pub, watchedAddrs, dep.addresses.usdt);
  for (const [k, v] of Object.entries(before)) {
    console.log(`  ${k.padEnd(10)}  ${fromUsdt(v).toFixed(2)} USDT`);
  }

  const repBefore = (await pub.readContract({
    address: dep.addresses.reputation, abi: reputationAbi,
    functionName: "getReputation", args: [w.chioma.address],
  })) as { ordersCompleted: bigint };
  console.log(`  CHIOMA.reputation.ordersCompleted=${repBefore.ordersCompleted}`);

  const tierBefore = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getTier", args: [w.chioma.address],
  })) as number;
  console.log(`  CHIOMA.stakeTier(before)=${tierBefore} (0=None)`);

  // ---------- Step A: idempotent stake setup ----------
  let txApproveStake: any = { hash: null, gasUsed: 0n };
  let txDepositStake: any = { hash: null, gasUsed: 0n };
  const stakeSkipped = tierBefore === 1;
  if (stakeSkipped) {
    console.log(`\n--- Step A: CHIOMA already at Starter tier, skipping stake deposit ---`);
  } else {
    console.log(`\n--- Step A1: CHIOMA approve(stake, 10 USDT) ---`);
    txApproveStake = await sendTxWithEstimate(
      pub, wChioma, dep.addresses.usdt, erc20Abi, "approve",
      [dep.addresses.stake, stakeAmount], "USDT.approve(stake,10)",
    );

    console.log(`\n--- Step A2: CHIOMA depositStake(Starter=1) ---`);
    txDepositStake = await sendTxWithEstimate(
      pub, wChioma, dep.addresses.stake, stakeAbi, "depositStake",
      [1], "depositStake(Starter)",
    );
    const stakeEvent = captureEventFromReceipt<any>(txDepositStake.receipt, "StakeDeposited", stakeAbi);
    assertOrThrow(stakeEvent !== null, "StakeDeposited event missing");
    console.log(`  → tier=${stakeEvent!.tier}  amount=${fromUsdt(stakeEvent!.amount)} USDT`);
  }

  const afterStake = await snapshotBalances(pub, watchedAddrs, dep.addresses.usdt);
  console.log(`  → stake contract USDT after deposit: ${fromUsdt(afterStake.stake).toFixed(2)}`);

  // ---------- Step B1: MAMADOU approve Escrow ----------
  console.log(`\n--- Step B1: MAMADOU approve(escrow, 80 USDT) ---`);
  const txApproveEscrow = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.usdt, erc20Abi, "approve",
    [dep.addresses.escrow, total], "USDT.approve(escrow,80)",
  );

  // ---------- Step B2: createOrderWithItems cross-border ----------
  console.log(`\n--- Step B2: MAMADOU createOrderWithItems(CHIOMA, [80], true) ---`);
  const txCreate = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "createOrderWithItems",
    [w.chioma.address, [total], true], "createOrderWithItems(cross-border)",
  );
  const createdArgs = captureEventFromReceipt<any>(txCreate.receipt, "OrderCreated", escrowAbi);
  assertOrThrow(createdArgs !== null, "OrderCreated event missing");
  const orderId = createdArgs!.orderId as bigint;
  console.log(`  → orderId=${orderId} itemCount=${createdArgs!.itemCount} isCrossBorder=${createdArgs!.isCrossBorder}`);

  const itemIds = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi,
    functionName: "getOrderItems", args: [orderId],
  })) as bigint[];
  assertOrThrow(itemIds.length === 1, "expected 1 item", { actual: itemIds.length, expected: 1 });
  const itemId = itemIds[0];
  console.log(`  → itemId=${itemId}`);

  // ---------- Step B3: fundOrder ----------
  console.log(`\n--- Step B3: MAMADOU fundOrder(${orderId}) ---`);
  const txFund = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "fundOrder",
    [orderId], `fundOrder(${orderId})`,
  );

  const afterFund = await snapshotBalances(pub, watchedAddrs, dep.addresses.usdt);
  console.log(`  → escrow USDT after fund: ${fromUsdt(afterFund.escrow).toFixed(2)}`);

  // ---------- Step C: shipItemsGrouped (auto 20% release) ----------
  console.log(`\n--- Step C: CHIOMA shipItemsGrouped(${orderId}, [${itemId}]) ---`);
  const shipProof = keccak256(toBytes("DHL-scenario2-ship"));
  const txShip = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.escrow, escrowAbi, "shipItemsGrouped",
    [orderId, [itemId], shipProof], `shipItemsGrouped(${orderId})`,
  );
  const shipArgs = captureEventFromReceipt<any>(txShip.receipt, "ShipmentGroupCreated", escrowAbi);
  assertOrThrow(shipArgs !== null, "ShipmentGroupCreated event missing");
  const groupId = shipArgs!.groupId as bigint;
  const partialRelease = captureEventFromReceipt<any>(txShip.receipt, "PartialReleaseTriggered", escrowAbi);
  assertOrThrow(partialRelease !== null, "PartialReleaseTriggered event missing (cross-border 20%)");
  console.log(`  → groupId=${groupId}`);
  console.log(`  → PartialReleaseTriggered stage=${partialRelease!.releaseStage} amount=${fromUsdt(partialRelease!.amount)} USDT`);

  const afterShip = await snapshotBalances(pub, watchedAddrs, dep.addresses.usdt);
  const shipDiffs = computeBalanceDiffs(afterFund, afterShip);
  console.log(`  → CHIOMA delta after ship: +${fromUsdt(shipDiffs.chioma)} USDT`);
  console.log(`  → escrow delta after ship: ${fromUsdt(shipDiffs.escrow)} USDT`);
  console.log(`  → treasury delta after ship: ${fromUsdt(shipDiffs.treasury)} USDT (commission stays until final)`);

  // ---------- Step D: markGroupArrived ----------
  console.log(`\n--- Step D: CHIOMA markGroupArrived(${orderId}, ${groupId}) ---`);
  const arrivalProof = keccak256(toBytes("DHL-scenario2-arrival"));
  const txArrive = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.escrow, escrowAbi, "markGroupArrived",
    [orderId, groupId, arrivalProof], `markGroupArrived(${orderId},${groupId})`,
  );
  const arriveEvent = captureEventFromReceipt<any>(txArrive.receipt, "GroupArrived", escrowAbi);
  assertOrThrow(arriveEvent !== null, "GroupArrived event missing");

  // ---------- Step E: confirmItemDelivery ----------
  console.log(`\n--- Step E: MAMADOU confirmItemDelivery(${orderId}, ${itemId}) ---`);
  const txConfirm = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "confirmItemDelivery",
    [orderId, itemId], `confirmItemDelivery(${orderId},${itemId})`,
  );
  const released = captureAllEventsFromReceipt<any>(txConfirm.receipt, "ItemReleased", escrowAbi);
  const orderCompleted = captureEventFromReceipt<any>(txConfirm.receipt, "OrderCompleted", escrowAbi);
  console.log(`  → ItemReleased events: ${released.length}`);
  for (const e of released) console.log(`     itemId=${e.itemId}  amount=${fromUsdt(e.amount)} USDT`);
  console.log(`  → OrderCompleted emitted: ${orderCompleted !== null}`);

  // ---------- Snapshot AFTER ----------
  console.log(`\n--- Snapshot AFTER ---`);
  const after = await snapshotBalances(pub, watchedAddrs, dep.addresses.usdt);
  for (const [k, v] of Object.entries(after)) {
    console.log(`  ${k.padEnd(10)}  ${fromUsdt(v).toFixed(2)} USDT`);
  }
  const diffs = computeBalanceDiffs(before, after);

  // ---------- Assertions ----------
  console.log(`\n--- Assertions ---`);
  const failures: string[] = [];
  function check(label: string, cond: boolean, extra?: string) {
    if (cond) console.log(`  [OK]   ${label}${extra ? "  " + extra : ""}`);
    else { console.log(`  [FAIL] ${label}${extra ? "  " + extra : ""}`); failures.push(label); }
  }
  const dust = 1n;
  const absDiff = (a: bigint, b: bigint) => (a > b ? a - b : b - a);

  // CHIOMA: if we staked this run: -10 + 77.84 = +67.84
  //         if stake was already deposited: just +77.84 (no new stake outflow)
  const chiomaExpected = stakeSkipped ? sellerNetExpected : (-stakeAmount + sellerNetExpected);
  const chiomaLabel = stakeSkipped ? "CHIOMA delta (+net only)" : "CHIOMA delta (−stake +net)";
  check(chiomaLabel, absDiff(diffs.chioma, chiomaExpected) <= dust,
    `actual=${fromUsdt(diffs.chioma)} expected=${fromUsdt(chiomaExpected)}`);
  check("MAMADOU delta (−total)", absDiff(diffs.mamadou, -total) <= dust,
    `actual=${fromUsdt(diffs.mamadou)} expected=${fromUsdt(-total)}`);
  check("commissionTreasury delta (+commission)", absDiff(diffs.treasury, commissionExpected) <= dust,
    `actual=${fromUsdt(diffs.treasury)} expected=${fromUsdt(commissionExpected)}`);
  const stakeExpected = stakeSkipped ? 0n : stakeAmount;
  check(stakeSkipped ? "stake contract delta (0, skip)" : "stake contract delta (+10)",
    absDiff(diffs.stake, stakeExpected) <= dust,
    `actual=${fromUsdt(diffs.stake)} expected=${fromUsdt(stakeExpected)}`);
  check("Escrow delta (net zero)", absDiff(diffs.escrow, 0n) <= dust,
    `actual=${fromUsdt(diffs.escrow)}`);

  // intermediate: after-ship partial release
  check("ship released 20% net to seller", absDiff(shipDiffs.chioma, shipReleaseNet) <= dust,
    `actual=${fromUsdt(shipDiffs.chioma)} expected=${fromUsdt(shipReleaseNet)}`);
  check("ship kept commission in escrow", shipDiffs.treasury === 0n,
    `treasury delta after ship=${fromUsdt(shipDiffs.treasury)}`);

  // order/item final status
  const order = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi, functionName: "getOrder", args: [orderId],
  })) as { globalStatus: number };
  check("order.globalStatus == Completed(5)", Number(order.globalStatus) === 5,
    `status=${order.globalStatus}`);

  const item = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi, functionName: "getItem", args: [itemId],
  })) as { status: number; releasedAmount: bigint };
  check(`item ${itemId} status == Released(4)`, Number(item.status) === 4,
    `status=${item.status}`);
  check(`item ${itemId} releasedAmount == sellerNet (pre-commission accumulator)`,
    absDiff(item.releasedAmount, sellerNetExpected) <= dust,
    `released=${fromUsdt(item.releasedAmount)} expected=${fromUsdt(sellerNetExpected)}`);

  // stake
  const tierAfter = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getTier", args: [w.chioma.address],
  })) as number;
  check("CHIOMA tier == Starter(1)", Number(tierAfter) === 1, `tier=${tierAfter}`);

  // events across flow
  const allLogs = [
    ...(txDepositStake.receipt?.logs ?? []),
    ...txCreate.receipt.logs, ...txFund.receipt.logs,
    ...txShip.receipt.logs, ...txArrive.receipt.logs, ...txConfirm.receipt.logs,
  ];
  const combinedReceipt: any = { logs: allLogs };
  const expectedEvents = [
    "OrderCreated", "OrderFunded", "ShipmentGroupCreated",
    "PartialReleaseTriggered", "GroupArrived", "ItemReleased", "OrderCompleted",
  ];
  const ev = verifyAllEventsEmitted(combinedReceipt, expectedEvents, escrowAbi);
  check("all expected events emitted", ev.missing.length === 0, `missing=[${ev.missing.join(",")}]`);

  // reputation
  const repAfter = (await pub.readContract({
    address: dep.addresses.reputation, abi: reputationAbi,
    functionName: "getReputation", args: [w.chioma.address],
  })) as { ordersCompleted: bigint };
  const repDelta = repAfter.ordersCompleted - repBefore.ordersCompleted;
  check("reputation.ordersCompleted += 1", repDelta === 1n, `delta=${repDelta}`);

  // ---------- Save ----------
  const endedAt = new Date().toISOString();
  const result = {
    scenario: "2 — Cross-border 20% + buyer confirm",
    startedAt, endedAt,
    wallets: { seller: w.chioma.address, buyer: w.mamadou.address },
    order: { orderId, itemId, groupId, isCrossBorder: true, total, stakeAmount },
    txs: {
      approveStake: txApproveStake.hash, depositStake: txDepositStake.hash,
      approveEscrow: txApproveEscrow.hash, create: txCreate.hash, fund: txFund.hash,
      ship: txShip.hash, arrive: txArrive.hash, confirm: txConfirm.hash,
    },
    gasUsed: {
      approveStake: txApproveStake.gasUsed, depositStake: txDepositStake.gasUsed,
      approveEscrow: txApproveEscrow.gasUsed, create: txCreate.gasUsed, fund: txFund.gasUsed,
      ship: txShip.gasUsed, arrive: txArrive.gasUsed, confirm: txConfirm.gasUsed,
    },
    balances: {
      before: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, fromUsdt(v)])),
      afterShip: Object.fromEntries(Object.entries(afterShip).map(([k, v]) => [k, fromUsdt(v)])),
      after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, fromUsdt(v)])),
      deltas: Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, fromUsdt(v)])),
      shipDeltas: Object.fromEntries(Object.entries(shipDiffs).map(([k, v]) => [k, fromUsdt(v)])),
    },
    expected: {
      commission: fromUsdt(commissionExpected),
      sellerNet: fromUsdt(sellerNetExpected),
      shipReleaseNet: fromUsdt(shipReleaseNet),
      confirmReleaseNet: fromUsdt(confirmReleaseNet),
    },
    events: {
      itemReleasedCount: released.length,
      partialReleaseEmitted: partialRelease !== null,
      groupArrivedEmitted: arriveEvent !== null,
      orderCompletedEmitted: orderCompleted !== null,
      missing: ev.missing,
    },
    finalStatus: {
      orderGlobalStatus: Number(order.globalStatus),
      itemStatus: Number(item.status),
      releasedAmount: fromUsdt(item.releasedAmount),
      tier: Number(tierAfter),
      reputationDelta: Number(repDelta),
    },
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures,
  };
  const outPath = saveScenarioResult("scenario2", result);
  console.log(`\nSaved: ${outPath}`);

  if (failures.length) {
    console.error(`\n❌ Scenario 2 FAIL — ${failures.length} failures:`);
    for (const f of failures) console.error(`  - ${f}`);
    throw new Error(`Scenario 2 FAIL`);
  }
  console.log(`\n✅ Scenario 2 PASS`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
});
