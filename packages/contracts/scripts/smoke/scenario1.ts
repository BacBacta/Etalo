/**
 * smoke/scenario1.ts — Intra-Africa 2-item happy path (Phase B #1).
 *
 * Seller: CHIOMA  /  Buyer: AISSA  /  2 items × 35 USDT = 70 USDT
 * Flow: approve → createOrderWithItems(intra) → fundOrder
 *       → shipItemsGrouped(1 group, 2 items) → confirmGroupDelivery
 *
 * Validates: Phases 1 (create) / 2 (fund) / 3 (ship) / 5 (release)
 *            + commission 1.8% intra + reputation recording.
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

// Scenario-local ABIs (structs + functions + events we actually use)
const escrowAbi = parseAbi([
  "struct Order { uint256 orderId; address buyer; address seller; uint256 totalAmount; uint256 totalCommission; uint256 createdAt; uint256 fundedAt; bool isCrossBorder; uint8 globalStatus; uint256 itemCount; uint256 shipmentGroupCount; }",
  "struct Item { uint256 itemId; uint256 orderId; uint256 itemPrice; uint256 itemCommission; uint256 shipmentGroupId; uint256 releasedAmount; uint8 status; }",
  "function createOrderWithItems(address seller, uint256[] itemPrices, bool isCrossBorder) returns (uint256)",
  "function fundOrder(uint256 orderId)",
  "function shipItemsGrouped(uint256 orderId, uint256[] itemIds, bytes32 proofHash) returns (uint256)",
  "function confirmGroupDelivery(uint256 orderId, uint256 groupId)",
  "function getOrderItems(uint256 orderId) view returns (uint256[])",
  "function getOrder(uint256 orderId) view returns (Order)",
  "function getItem(uint256 itemId) view returns (Item)",
  "event OrderCreated(uint256 indexed orderId, address indexed buyer, address indexed seller, uint256 totalAmount, bool isCrossBorder, uint256 itemCount)",
  "event OrderFunded(uint256 indexed orderId, uint256 fundedAt)",
  "event ShipmentGroupCreated(uint256 indexed orderId, uint256 indexed groupId, uint256[] itemIds, bytes32 proofHash)",
  "event ItemReleased(uint256 indexed orderId, uint256 indexed itemId, uint256 amount)",
  "event ItemCompleted(uint256 indexed orderId, uint256 indexed itemId)",
  "event OrderCompleted(uint256 indexed orderId)",
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
  const wAissa = makeWalletClient(w.aissa);

  console.log(`=== Scenario 1 — Intra-Africa 2-item happy path ===`);
  console.log(`RPC:     ${safeRpcUrl()}`);
  console.log(`Seller:  CHIOMA  ${w.chioma.address}`);
  console.log(`Buyer:   AISSA   ${w.aissa.address}`);
  console.log(`Escrow:  ${dep.addresses.escrow}`);
  console.log(`USDT:    ${dep.addresses.usdt}\n`);

  const watchedAddrs = {
    chioma: w.chioma.address as `0x${string}`,
    aissa: w.aissa.address as `0x${string}`,
    treasury: dep.addresses.commissionTreasury,
    escrow: dep.addresses.escrow,
  };

  // ---------- BEFORE snapshot ----------
  console.log(`--- Balance snapshot BEFORE ---`);
  const before = await snapshotBalances(pub, watchedAddrs, dep.addresses.usdt);
  for (const [k, v] of Object.entries(before)) {
    console.log(`  ${k.padEnd(10)}  ${fromUsdt(v).toFixed(2)} USDT`);
  }

  const repBefore = (await pub.readContract({
    address: dep.addresses.reputation, abi: reputationAbi,
    functionName: "getReputation", args: [w.chioma.address],
  })) as { ordersCompleted: bigint; totalVolume: bigint };
  console.log(`  CHIOMA.reputation.ordersCompleted=${repBefore.ordersCompleted}  totalVolume=${fromUsdt(repBefore.totalVolume).toFixed(2)}`);

  // ---------- Expected amounts ----------
  const total = usdt(70);
  const commissionExpected = (total * 18n) / 1000n; // 1.8% intra
  const sellerNetExpected = total - commissionExpected;

  // ---------- Step 1: approve ----------
  console.log(`\n--- Step 1: AISSA approve(escrow, 70 USDT) ---`);
  const txApprove = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.usdt, erc20Abi, "approve",
    [dep.addresses.escrow, total], "USDT.approve(escrow,70)",
  );

  // ---------- Step 2: createOrderWithItems ----------
  console.log(`\n--- Step 2: AISSA createOrderWithItems(CHIOMA, [35,35], intra) ---`);
  const txCreate = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "createOrderWithItems",
    [w.chioma.address, [usdt(35), usdt(35)], false], "createOrderWithItems",
  );
  const createdArgs = captureEventFromReceipt<any>(txCreate.receipt, "OrderCreated", escrowAbi);
  assertOrThrow(createdArgs !== null, "OrderCreated event not found");
  const orderId = createdArgs!.orderId as bigint;
  console.log(`  → orderId=${orderId} itemCount=${createdArgs!.itemCount}`);
  const itemIds = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi,
    functionName: "getOrderItems", args: [orderId],
  })) as bigint[];
  console.log(`  → itemIds=[${itemIds.join(", ")}]`);
  assertOrThrow(itemIds.length === 2, "expected 2 items", { actual: itemIds.length, expected: 2 });

  // ---------- Step 3: fundOrder ----------
  console.log(`\n--- Step 3: AISSA fundOrder(${orderId}) ---`);
  const txFund = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "fundOrder",
    [orderId], `fundOrder(${orderId})`,
  );

  // ---------- Step 4: shipItemsGrouped ----------
  console.log(`\n--- Step 4: CHIOMA shipItemsGrouped(${orderId}, [${itemIds.join(",")}], proof) ---`);
  const proofHash = keccak256(toBytes("DHL-12345-scenario1"));
  const txShip = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.escrow, escrowAbi, "shipItemsGrouped",
    [orderId, itemIds, proofHash], `shipItemsGrouped(${orderId})`,
  );
  const shipArgs = captureEventFromReceipt<any>(txShip.receipt, "ShipmentGroupCreated", escrowAbi);
  assertOrThrow(shipArgs !== null, "ShipmentGroupCreated event not found");
  const groupId = shipArgs!.groupId as bigint;
  console.log(`  → groupId=${groupId}`);

  // ---------- Step 5: confirmGroupDelivery ----------
  console.log(`\n--- Step 5: AISSA confirmGroupDelivery(${orderId}, ${groupId}) ---`);
  const txConfirm = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "confirmGroupDelivery",
    [orderId, groupId], `confirmGroupDelivery(${orderId},${groupId})`,
  );

  const released = captureAllEventsFromReceipt<any>(txConfirm.receipt, "ItemReleased", escrowAbi);
  const orderCompleted = captureEventFromReceipt<any>(txConfirm.receipt, "OrderCompleted", escrowAbi);
  console.log(`  → ItemReleased events: ${released.length}`);
  for (const e of released) console.log(`     itemId=${e.itemId}  amount=${fromUsdt(e.amount).toFixed(2)} USDT`);
  console.log(`  → OrderCompleted emitted: ${orderCompleted !== null}`);

  // ---------- AFTER snapshot ----------
  console.log(`\n--- Balance snapshot AFTER ---`);
  const after = await snapshotBalances(pub, watchedAddrs, dep.addresses.usdt);
  for (const [k, v] of Object.entries(after)) {
    console.log(`  ${k.padEnd(10)}  ${fromUsdt(v).toFixed(2)} USDT`);
  }
  const diffs = computeBalanceDiffs(before, after);

  // ---------- Assertions ----------
  console.log(`\n--- Assertions ---`);
  const failures: string[] = [];
  function check(label: string, cond: boolean, extra?: string) {
    if (cond) {
      console.log(`  [OK]   ${label}${extra ? "  " + extra : ""}`);
    } else {
      console.log(`  [FAIL] ${label}${extra ? "  " + extra : ""}`);
      failures.push(label);
    }
  }

  const dust = 1n;
  const absDiff = (a: bigint, b: bigint) => (a > b ? a - b : b - a);

  check("CHIOMA delta (+net)", absDiff(diffs.chioma, sellerNetExpected) <= dust,
    `actual=${fromUsdt(diffs.chioma)} expected=${fromUsdt(sellerNetExpected)}`);
  check("AISSA delta (−total)", absDiff(diffs.aissa, -total) <= dust,
    `actual=${fromUsdt(diffs.aissa)} expected=${fromUsdt(-total)}`);
  check("commissionTreasury delta", absDiff(diffs.treasury, commissionExpected) <= dust,
    `actual=${fromUsdt(diffs.treasury)} expected=${fromUsdt(commissionExpected)}`);
  check("Escrow delta (net zero)", absDiff(diffs.escrow, 0n) <= dust,
    `actual=${fromUsdt(diffs.escrow)}`);

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

  check("2 × ItemReleased events", released.length === 2,
    `count=${released.length}`);
  check("OrderCompleted emitted", orderCompleted !== null);

  // all expected events at least once across the whole flow
  const allLogs = [
    ...txCreate.receipt.logs, ...txFund.receipt.logs,
    ...txShip.receipt.logs, ...txConfirm.receipt.logs,
  ];
  const combinedReceipt: any = { logs: allLogs };
  const expectedEvents = ["OrderCreated", "OrderFunded", "ShipmentGroupCreated", "ItemReleased", "OrderCompleted"];
  const ev = verifyAllEventsEmitted(combinedReceipt, expectedEvents, escrowAbi);
  check("all expected events across flow", ev.missing.length === 0,
    `missing=[${ev.missing.join(",")}]`);

  // reputation
  const repAfter = (await pub.readContract({
    address: dep.addresses.reputation, abi: reputationAbi,
    functionName: "getReputation", args: [w.chioma.address],
  })) as { ordersCompleted: bigint };
  const repDelta = repAfter.ordersCompleted - repBefore.ordersCompleted;
  check("reputation.ordersCompleted += 2", repDelta === 2n,
    `delta=${repDelta}`);

  // ---------- Save artifact ----------
  const endedAt = new Date().toISOString();
  const result = {
    scenario: "1 — Intra-Africa 2-item happy path",
    startedAt, endedAt,
    wallets: { seller: w.chioma.address, buyer: w.aissa.address },
    order: { orderId, itemIds, groupId, isCrossBorder: false, total },
    txs: {
      approve: txApprove.hash, create: txCreate.hash, fund: txFund.hash,
      ship: txShip.hash, confirm: txConfirm.hash,
    },
    gasUsed: {
      approve: txApprove.gasUsed, create: txCreate.gasUsed, fund: txFund.gasUsed,
      ship: txShip.gasUsed, confirm: txConfirm.gasUsed,
    },
    balances: {
      before: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, fromUsdt(v)])),
      after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, fromUsdt(v)])),
      deltas: Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, fromUsdt(v)])),
    },
    expected: {
      commission: fromUsdt(commissionExpected),
      sellerNet: fromUsdt(sellerNetExpected),
    },
    events: {
      itemReleasedCount: released.length,
      orderCompleted: orderCompleted !== null,
      allEventsEmitted: ev.missing.length === 0,
      missing: ev.missing,
    },
    finalStatus: {
      orderGlobalStatus: Number(order.globalStatus),
      itemStatuses,
      reputationOrdersCompletedDelta: Number(repDelta),
    },
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures,
  };
  const outPath = saveScenarioResult("scenario1", result);
  console.log(`\nSaved: ${outPath}`);

  if (failures.length) {
    console.error(`\n❌ Scenario 1 FAIL — ${failures.length} failures:`);
    for (const f of failures) console.error(`  - ${f}`);
    throw new Error(`Scenario 1 FAIL`);
  }
  console.log(`\n✅ Scenario 1 PASS`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
});
