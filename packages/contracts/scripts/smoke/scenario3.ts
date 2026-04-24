/**
 * smoke/scenario3.ts — Sibling isolation + N1 amicable dispute (Phase B #3).
 *
 * Seller: CHIOMA (Tier 1 Starter, already staked)
 * Buyer:  MAMADOU
 * 3 items × 30 USDT cross-border = 90 USDT (< 100 cap Starter)
 * Dispute on item 2 with N1 amicable refund 15 USDT
 * Items 1 and 3 confirmed normally (sibling isolation, ADR-015)
 *
 * Flow:
 *   A. MAMADOU approve(escrow, 90) + create(cross-border, 3×30) + fund
 *   B. CHIOMA ship 3-item group → 20% net × 3 = 17.514 USDT released
 *   C. CHIOMA markGroupArrived
 *   D. MAMADOU openDispute(item2)
 *      → item2 Disputed, freezeCount 0→1, pauseWithdrawal(CHIOMA)
 *   E. MAMADOU resolveN1Amicable(disputeId, 15) — buyer proposal
 *   F. CHIOMA resolveN1Amicable(disputeId, 15) — seller match → resolve
 *      → item2 Released, refund 15 to MAMADOU, net 8.914626 to CHIOMA,
 *        commission 0.247374 to treasury, resumeWithdrawal
 *   G. MAMADOU confirmItemDelivery(item1) → full release 23.352 net
 *      + 0.81 commission
 *   H. MAMADOU confirmItemDelivery(item3) → same + OrderCompleted
 *      + stake.decrementActiveSales (activeSales 1→0)
 *
 * Validates: Phase 5 (sibling isolation), 6 (N1 bilateral match),
 *            12 (Dispute↔Escrow↔Stake freeze/resume).
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
  "event ItemDisputed(uint256 indexed orderId, uint256 indexed itemId)",
  "event ItemDisputeResolved(uint256 indexed orderId, uint256 indexed itemId, uint256 refundAmount)",
  "event ItemReleased(uint256 indexed orderId, uint256 indexed itemId, uint256 amount)",
  "event ItemCompleted(uint256 indexed orderId, uint256 indexed itemId)",
  "event OrderCompleted(uint256 indexed orderId)",
]);

const disputeAbi = parseAbi([
  "function openDispute(uint256 orderId, uint256 itemId, string reason) returns (uint256)",
  "function resolveN1Amicable(uint256 disputeId, uint256 refundAmount)",
  "event DisputeOpened(uint256 indexed disputeId, uint256 indexed orderId, uint256 indexed itemId, address buyer, string reason)",
  "event DisputeResolved(uint256 indexed disputeId, bool favorBuyer, uint256 refundAmount, uint256 slashAmount)",
]);

const stakeAbi = parseAbi([
  "function getActiveSales(address seller) view returns (uint256)",
  "function getTier(address seller) view returns (uint8)",
  "function getWithdrawal(address seller) view returns (uint256 amount, uint8 targetTier, uint256 unlockAt, uint256 frozenRemaining, bool active, uint256 freezeCount)",
  "event WithdrawalPaused(address indexed seller, uint256 disputeId)",
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
  const wChioma = makeWalletClient(w.chioma);
  const wMamadou = makeWalletClient(w.mamadou);

  console.log(`=== Scenario 3 — Sibling isolation + N1 amicable dispute ===`);
  console.log(`RPC:     ${safeRpcUrl()}`);
  console.log(`Seller:  CHIOMA   ${w.chioma.address}`);
  console.log(`Buyer:   MAMADOU  ${w.mamadou.address}`);
  console.log(`Escrow:  ${dep.addresses.escrow}`);
  console.log(`Dispute: ${dep.addresses.dispute}`);
  console.log(`Stake:   ${dep.addresses.stake}\n`);

  const watched = {
    chioma: w.chioma.address as `0x${string}`,
    mamadou: w.mamadou.address as `0x${string}`,
    treasury: dep.addresses.commissionTreasury,
    escrow: dep.addresses.escrow,
    stake: dep.addresses.stake,
  };

  // Expected amounts (user spec)
  const total = usdt(90);
  const perItem = usdt(30);
  const commissionPerItem = (perItem * 27n) / 1000n; // 0.81 USDT
  const netPerItem = perItem - commissionPerItem;   // 29.19 USDT

  // Ship 20% per item (net)
  const shipNetPerItem = (perItem * 20n * 973n) / (100n * 1000n); // 5.838
  const shipNetTotal = shipNetPerItem * 3n; // 17.514

  // Dispute with refund 15 USDT on item 2 (already released 5.838 net)
  const refundAmount = usdt(15);
  // remainingInEscrow = itemPrice - releasedAmount = 30 - 5.838 = 24.162
  // remainingAfterRefund = 24.162 - 15 = 9.162
  // commissionShare = (remainingAfterRefund * itemCommission) / itemPrice
  const remainingInEscrow = perItem - shipNetPerItem;
  const remainingAfterRefund = remainingInEscrow - refundAmount;
  const disputeCommissionShare = (remainingAfterRefund * commissionPerItem) / perItem;
  const disputeNetShare = remainingAfterRefund - disputeCommissionShare;

  // Items 1 and 3 full release: remainingNet = netPerItem - shipNetPerItem
  const confirmNetPerItem = netPerItem - shipNetPerItem; // 29.19 - 5.838 = 23.352
  const confirmCommissionPerItem = commissionPerItem;    // 0.81 per item

  // Expected total deltas
  const chiomaDelta =
    shipNetTotal +              // 17.514
    disputeNetShare +           // ~8.9146
    confirmNetPerItem * 2n;     // 46.704
  const mamadouDelta = -total + refundAmount; // -75
  const treasuryDelta = disputeCommissionShare + confirmCommissionPerItem * 2n; // ~1.8674
  // Conservation: chioma + mamadou + treasury = 0 (escrow pass-through)

  console.log(`Expected (USDT):`);
  console.log(`  Ship net × 3:     ${fromUsdt(shipNetTotal).toFixed(6)}`);
  console.log(`  Dispute net:      ${fromUsdt(disputeNetShare).toFixed(6)}`);
  console.log(`  Dispute comm:     ${fromUsdt(disputeCommissionShare).toFixed(6)}`);
  console.log(`  Item 1+3 net:     ${fromUsdt(confirmNetPerItem * 2n).toFixed(6)}`);
  console.log(`  Item 1+3 comm:    ${fromUsdt(confirmCommissionPerItem * 2n).toFixed(6)}`);
  console.log(`  CHIOMA delta:     +${fromUsdt(chiomaDelta).toFixed(6)}`);
  console.log(`  MAMADOU delta:    ${fromUsdt(mamadouDelta).toFixed(6)}`);
  console.log(`  Treasury delta:   +${fromUsdt(treasuryDelta).toFixed(6)}`);
  console.log(`  Conservation sum: ${fromUsdt(chiomaDelta + mamadouDelta + treasuryDelta).toFixed(6)}\n`);

  // ---------- BEFORE ----------
  console.log(`--- Snapshot BEFORE ---`);
  const before = await snapshotBalances(pub, watched, dep.addresses.usdt);
  for (const [k, v] of Object.entries(before)) {
    console.log(`  ${k.padEnd(10)}  ${fromUsdt(v).toFixed(2)} USDT`);
  }
  const repBefore = (await pub.readContract({
    address: dep.addresses.reputation, abi: reputationAbi,
    functionName: "getReputation", args: [w.chioma.address],
  })) as { ordersCompleted: bigint; ordersDisputed: bigint; disputesLost: bigint };
  const wdBefore = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getWithdrawal", args: [w.chioma.address],
  })) as readonly [bigint, number, bigint, bigint, boolean, bigint];
  const activeSalesBefore = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getActiveSales", args: [w.chioma.address],
  })) as bigint;
  console.log(`  CHIOMA.reputation: completed=${repBefore.ordersCompleted} disputed=${repBefore.ordersDisputed} lost=${repBefore.disputesLost}`);
  console.log(`  CHIOMA.stake.activeSales=${activeSalesBefore}  freezeCount=${wdBefore[5]}`);

  // ---------- Step A1: approve ----------
  console.log(`\n--- Step A1: MAMADOU approve(escrow, 90 USDT) ---`);
  const txApprove = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.usdt, erc20Abi, "approve",
    [dep.addresses.escrow, total], "USDT.approve(escrow,90)",
  );

  // ---------- Step A2: createOrder ----------
  console.log(`\n--- Step A2: MAMADOU createOrderWithItems([30,30,30], cross-border) ---`);
  const txCreate = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "createOrderWithItems",
    [w.chioma.address, [perItem, perItem, perItem], true], "createOrder(3×30)",
  );
  const createdArgs = captureEventFromReceipt<any>(txCreate.receipt, "OrderCreated", escrowAbi);
  assertOrThrow(createdArgs !== null, "OrderCreated event missing");
  const orderId = createdArgs!.orderId as bigint;
  const itemIds = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi,
    functionName: "getOrderItems", args: [orderId],
  })) as bigint[];
  assertOrThrow(itemIds.length === 3, "expected 3 items");
  console.log(`  → orderId=${orderId}  itemIds=[${itemIds.join(", ")}]`);
  const [item1, item2, item3] = itemIds;

  // ---------- Step A3: fund ----------
  console.log(`\n--- Step A3: MAMADOU fundOrder(${orderId}) ---`);
  const txFund = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "fundOrder",
    [orderId], `fundOrder(${orderId})`,
  );

  // ---------- Step B: ship 3-item group ----------
  console.log(`\n--- Step B: CHIOMA shipItemsGrouped (3 items, 20% release × 3) ---`);
  const shipProof = keccak256(toBytes("DHL-scenario3-ship"));
  const txShip = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.escrow, escrowAbi, "shipItemsGrouped",
    [orderId, itemIds, shipProof], `shipItemsGrouped(3 items)`,
  );
  const shipArgs = captureEventFromReceipt<any>(txShip.receipt, "ShipmentGroupCreated", escrowAbi);
  assertOrThrow(shipArgs !== null, "ShipmentGroupCreated event missing");
  const groupId = shipArgs!.groupId as bigint;
  const partialRelease = captureEventFromReceipt<any>(txShip.receipt, "PartialReleaseTriggered", escrowAbi);
  assertOrThrow(partialRelease !== null, "PartialReleaseTriggered event missing");
  console.log(`  → groupId=${groupId}  partialRelease=${fromUsdt(partialRelease!.amount)} USDT`);

  const afterShip = await snapshotBalances(pub, watched, dep.addresses.usdt);
  const shipDiffs = computeBalanceDiffs(before, afterShip);
  console.log(`  → chioma delta post-ship:   +${fromUsdt(shipDiffs.chioma).toFixed(6)} USDT`);
  console.log(`  → escrow delta post-ship:   ${fromUsdt(shipDiffs.escrow).toFixed(6)} USDT`);

  // ---------- Step C: markGroupArrived ----------
  console.log(`\n--- Step C: CHIOMA markGroupArrived ---`);
  const arrivalProof = keccak256(toBytes("DHL-scenario3-arrived"));
  const txArrive = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.escrow, escrowAbi, "markGroupArrived",
    [orderId, groupId, arrivalProof], `markGroupArrived`,
  );

  // ---------- Step D: MAMADOU openDispute on item 2 ----------
  console.log(`\n--- Step D: MAMADOU openDispute(order=${orderId}, item=${item2}) ---`);
  const txOpenDispute = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.dispute, disputeAbi, "openDispute",
    [orderId, item2, "Item 2 damaged in transit"], `openDispute(item2)`,
  );
  const disputeOpened = captureEventFromReceipt<any>(txOpenDispute.receipt, "DisputeOpened", disputeAbi);
  assertOrThrow(disputeOpened !== null, "DisputeOpened event missing");
  const disputeId = disputeOpened!.disputeId as bigint;
  console.log(`  → disputeId=${disputeId}`);

  const wdAfterOpen = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getWithdrawal", args: [w.chioma.address],
  })) as readonly [bigint, number, bigint, bigint, boolean, bigint];
  console.log(`  → CHIOMA.stake.freezeCount after openDispute: ${wdAfterOpen[5]}`);
  assertOrThrow(wdAfterOpen[5] === 1n, "freezeCount should be 1 after openDispute",
    { actual: wdAfterOpen[5].toString(), expected: "1" });

  // ---------- Step E: MAMADOU proposes N1 refund ----------
  console.log(`\n--- Step E: MAMADOU resolveN1Amicable(disputeId, 15) — buyer proposes ---`);
  const txN1Buyer = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.dispute, disputeAbi, "resolveN1Amicable",
    [disputeId, refundAmount], "resolveN1Amicable(buyer)",
  );
  // Buyer-only proposal should NOT trigger DisputeResolved yet
  const maybeResolvedBuyer = captureEventFromReceipt<any>(txN1Buyer.receipt, "DisputeResolved", disputeAbi);
  assertOrThrow(maybeResolvedBuyer === null, "DisputeResolved should NOT fire on buyer-only proposal");

  // ---------- Step F: CHIOMA matches → resolution triggered ----------
  console.log(`\n--- Step F: CHIOMA resolveN1Amicable(disputeId, 15) — seller matches → resolve ---`);
  const txN1Seller = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.dispute, disputeAbi, "resolveN1Amicable",
    [disputeId, refundAmount], "resolveN1Amicable(seller)",
  );
  const disputeResolved = captureEventFromReceipt<any>(txN1Seller.receipt, "DisputeResolved", disputeAbi);
  assertOrThrow(disputeResolved !== null, "DisputeResolved event missing on match");
  const itemDisputeResolved = captureEventFromReceipt<any>(txN1Seller.receipt, "ItemDisputeResolved", escrowAbi);
  assertOrThrow(itemDisputeResolved !== null, "ItemDisputeResolved event missing on escrow side");
  console.log(`  → DisputeResolved favorBuyer=${disputeResolved!.favorBuyer} refund=${fromUsdt(disputeResolved!.refundAmount)} slash=${fromUsdt(disputeResolved!.slashAmount)}`);

  const wdAfterResolve = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getWithdrawal", args: [w.chioma.address],
  })) as readonly [bigint, number, bigint, bigint, boolean, bigint];
  console.log(`  → CHIOMA.stake.freezeCount after resolve: ${wdAfterResolve[5]}`);

  const afterDispute = await snapshotBalances(pub, watched, dep.addresses.usdt);

  // ---------- Step G: confirm item 1 ----------
  console.log(`\n--- Step G: MAMADOU confirmItemDelivery(${item1}) ---`);
  const txConfirm1 = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "confirmItemDelivery",
    [orderId, item1], `confirmItemDelivery(item1)`,
  );
  const rel1 = captureEventFromReceipt<any>(txConfirm1.receipt, "ItemReleased", escrowAbi);
  assertOrThrow(rel1 !== null, "ItemReleased missing for item1");

  // ---------- Step H: confirm item 3 → triggers OrderCompleted ----------
  console.log(`\n--- Step H: MAMADOU confirmItemDelivery(${item3}) ---`);
  const txConfirm3 = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "confirmItemDelivery",
    [orderId, item3], `confirmItemDelivery(item3)`,
  );
  const rel3 = captureEventFromReceipt<any>(txConfirm3.receipt, "ItemReleased", escrowAbi);
  assertOrThrow(rel3 !== null, "ItemReleased missing for item3");
  const orderCompleted = captureEventFromReceipt<any>(txConfirm3.receipt, "OrderCompleted", escrowAbi);
  assertOrThrow(orderCompleted !== null, "OrderCompleted missing after last confirm");

  // ---------- AFTER ----------
  console.log(`\n--- Snapshot AFTER ---`);
  const after = await snapshotBalances(pub, watched, dep.addresses.usdt);
  for (const [k, v] of Object.entries(after)) {
    console.log(`  ${k.padEnd(10)}  ${fromUsdt(v).toFixed(2)} USDT`);
  }
  const diffs = computeBalanceDiffs(before, after);
  const disputeDiffs = computeBalanceDiffs(afterShip, afterDispute);

  // ---------- Assertions ----------
  console.log(`\n--- Assertions ---`);
  const failures: string[] = [];
  function check(label: string, cond: boolean, extra?: string) {
    if (cond) console.log(`  [OK]   ${label}${extra ? "  " + extra : ""}`);
    else { console.log(`  [FAIL] ${label}${extra ? "  " + extra : ""}`); failures.push(label); }
  }
  const dust = 2n; // 2 wei tolerance — commissionShare integer-div can drift 1 wei
  const absDiff = (a: bigint, b: bigint) => (a > b ? a - b : b - a);

  check("CHIOMA delta (ship+dispute+2×item)",
    absDiff(diffs.chioma, chiomaDelta) <= dust,
    `actual=${fromUsdt(diffs.chioma)} expected=${fromUsdt(chiomaDelta)}`);
  check("MAMADOU delta (−fund +refund)",
    absDiff(diffs.mamadou, mamadouDelta) <= dust,
    `actual=${fromUsdt(diffs.mamadou)} expected=${fromUsdt(mamadouDelta)}`);
  check("commissionTreasury delta",
    absDiff(diffs.treasury, treasuryDelta) <= dust,
    `actual=${fromUsdt(diffs.treasury)} expected=${fromUsdt(treasuryDelta)}`);
  check("Escrow delta (net zero)", absDiff(diffs.escrow, 0n) <= dust,
    `actual=${fromUsdt(diffs.escrow)}`);
  check("Stake contract delta (0)", absDiff(diffs.stake, 0n) <= dust,
    `actual=${fromUsdt(diffs.stake)}`);

  // Ship intermediate
  check("ship net × 3 = 17.514",
    absDiff(shipDiffs.chioma, shipNetTotal) <= dust,
    `actual=${fromUsdt(shipDiffs.chioma)} expected=${fromUsdt(shipNetTotal)}`);

  // Dispute intermediate
  check("dispute buyer refund = 15",
    absDiff(disputeDiffs.mamadou, refundAmount) <= dust,
    `actual=${fromUsdt(disputeDiffs.mamadou)} expected=${fromUsdt(refundAmount)}`);
  check("dispute seller net = ~8.9146",
    absDiff(disputeDiffs.chioma, disputeNetShare) <= dust,
    `actual=${fromUsdt(disputeDiffs.chioma)} expected=${fromUsdt(disputeNetShare)}`);
  check("dispute treasury commission = ~0.2474",
    absDiff(disputeDiffs.treasury, disputeCommissionShare) <= dust,
    `actual=${fromUsdt(disputeDiffs.treasury)} expected=${fromUsdt(disputeCommissionShare)}`);

  // Order + items final status
  const order = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi, functionName: "getOrder", args: [orderId],
  })) as { globalStatus: number };
  check("order.globalStatus == Completed(5)", Number(order.globalStatus) === 5,
    `status=${order.globalStatus}`);

  const itemStatuses: number[] = [];
  for (const iid of itemIds) {
    const item = (await pub.readContract({
      address: dep.addresses.escrow, abi: escrowAbi, functionName: "getItem", args: [iid],
    })) as { status: number };
    itemStatuses.push(Number(item.status));
    check(`item ${iid} status == Released(4)`, Number(item.status) === 4,
      `status=${item.status}`);
  }

  // Stake active sales + freezeCount back to pre-scenario values
  const activeSalesAfter = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getActiveSales", args: [w.chioma.address],
  })) as bigint;
  check(`activeSales returned to ${activeSalesBefore}`, activeSalesAfter === activeSalesBefore,
    `before=${activeSalesBefore} after=${activeSalesAfter}`);

  const wdAfterAll = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getWithdrawal", args: [w.chioma.address],
  })) as readonly [bigint, number, bigint, bigint, boolean, bigint];
  check(`freezeCount back to ${wdBefore[5]}`, wdAfterAll[5] === wdBefore[5],
    `before=${wdBefore[5]} after=${wdAfterAll[5]}`);

  // Events across flow
  const allLogs = [
    ...txCreate.receipt.logs, ...txFund.receipt.logs, ...txShip.receipt.logs,
    ...txArrive.receipt.logs, ...txOpenDispute.receipt.logs,
    ...txN1Buyer.receipt.logs, ...txN1Seller.receipt.logs,
    ...txConfirm1.receipt.logs, ...txConfirm3.receipt.logs,
  ];
  const combinedReceipt: any = { logs: allLogs };
  const expectedEscrowEvents = [
    "OrderCreated", "OrderFunded", "ShipmentGroupCreated", "PartialReleaseTriggered",
    "GroupArrived", "ItemDisputed", "ItemDisputeResolved",
    "ItemReleased", "ItemCompleted", "OrderCompleted",
  ];
  const ev = verifyAllEventsEmitted(combinedReceipt, expectedEscrowEvents, escrowAbi);
  check("all expected escrow events", ev.missing.length === 0,
    `missing=[${ev.missing.join(",")}]`);
  const evDispute = verifyAllEventsEmitted(combinedReceipt, ["DisputeOpened", "DisputeResolved"], disputeAbi);
  check("all expected dispute events", evDispute.missing.length === 0,
    `missing=[${evDispute.missing.join(",")}]`);

  // Reputation
  const repAfter = (await pub.readContract({
    address: dep.addresses.reputation, abi: reputationAbi,
    functionName: "getReputation", args: [w.chioma.address],
  })) as { ordersCompleted: bigint; ordersDisputed: bigint; disputesLost: bigint };
  const completedDelta = repAfter.ordersCompleted - repBefore.ordersCompleted;
  const disputedDelta = repAfter.ordersDisputed - repBefore.ordersDisputed;
  const lostDelta = repAfter.disputesLost - repBefore.disputesLost;
  check("reputation.ordersCompleted += 2 (items 1,3)", completedDelta === 2n, `delta=${completedDelta}`);
  check("reputation.ordersDisputed += 1 (item 2)", disputedDelta === 1n, `delta=${disputedDelta}`);
  check("reputation.disputesLost += 1 (refund > 0)", lostDelta === 1n, `delta=${lostDelta}`);

  // Ship ItemReleased count from confirms = 2 (items 1 and 3 only; item 2 released via ItemDisputeResolved)
  const allReleasedEvents = [
    ...captureAllEventsFromReceipt(txConfirm1.receipt, "ItemReleased", escrowAbi),
    ...captureAllEventsFromReceipt(txConfirm3.receipt, "ItemReleased", escrowAbi),
  ];
  check("ItemReleased × 2 (items 1,3 via confirm)", allReleasedEvents.length === 2,
    `count=${allReleasedEvents.length}`);

  // ---------- Save ----------
  const endedAt = new Date().toISOString();
  const result = {
    scenario: "3 — Sibling isolation + N1 amicable dispute",
    startedAt, endedAt,
    wallets: { seller: w.chioma.address, buyer: w.mamadou.address },
    order: { orderId, itemIds, groupId, disputeId, isCrossBorder: true, total },
    refundAmount,
    txs: {
      approve: txApprove.hash, create: txCreate.hash, fund: txFund.hash,
      ship: txShip.hash, arrive: txArrive.hash,
      openDispute: txOpenDispute.hash, n1Buyer: txN1Buyer.hash, n1Seller: txN1Seller.hash,
      confirm1: txConfirm1.hash, confirm3: txConfirm3.hash,
    },
    gasUsed: {
      approve: txApprove.gasUsed, create: txCreate.gasUsed, fund: txFund.gasUsed,
      ship: txShip.gasUsed, arrive: txArrive.gasUsed,
      openDispute: txOpenDispute.gasUsed, n1Buyer: txN1Buyer.gasUsed, n1Seller: txN1Seller.gasUsed,
      confirm1: txConfirm1.gasUsed, confirm3: txConfirm3.gasUsed,
    },
    balances: {
      before: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, fromUsdt(v)])),
      afterShip: Object.fromEntries(Object.entries(afterShip).map(([k, v]) => [k, fromUsdt(v)])),
      afterDispute: Object.fromEntries(Object.entries(afterDispute).map(([k, v]) => [k, fromUsdt(v)])),
      after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, fromUsdt(v)])),
      deltas: Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, fromUsdt(v)])),
      shipDeltas: Object.fromEntries(Object.entries(shipDiffs).map(([k, v]) => [k, fromUsdt(v)])),
      disputeDeltas: Object.fromEntries(Object.entries(disputeDiffs).map(([k, v]) => [k, fromUsdt(v)])),
    },
    expected: {
      shipNetTotal: fromUsdt(shipNetTotal),
      disputeNetShare: fromUsdt(disputeNetShare),
      disputeCommissionShare: fromUsdt(disputeCommissionShare),
      confirmNetPerItem: fromUsdt(confirmNetPerItem),
      confirmCommissionPerItem: fromUsdt(confirmCommissionPerItem),
      chiomaDelta: fromUsdt(chiomaDelta),
      mamadouDelta: fromUsdt(mamadouDelta),
      treasuryDelta: fromUsdt(treasuryDelta),
    },
    events: {
      missingEscrow: ev.missing,
      missingDispute: evDispute.missing,
      itemReleasedFromConfirms: allReleasedEvents.length,
    },
    stake: {
      freezeCountBefore: wdBefore[5],
      freezeCountAfterOpen: wdAfterOpen[5],
      freezeCountAfterResolve: wdAfterResolve[5],
      freezeCountAfterAll: wdAfterAll[5],
      activeSalesBefore, activeSalesAfter,
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
      deltas: { completedDelta, disputedDelta, lostDelta },
    },
    finalStatus: {
      orderGlobalStatus: Number(order.globalStatus),
      itemStatuses,
    },
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures,
  };
  const outPath = saveScenarioResult("scenario3", result);
  console.log(`\nSaved: ${outPath}`);

  if (failures.length) {
    console.error(`\n❌ Scenario 3 FAIL — ${failures.length} failures:`);
    for (const f of failures) console.error(`  - ${f}`);
    throw new Error(`Scenario 3 FAIL`);
  }
  console.log(`\n✅ Scenario 3 PASS`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
});
