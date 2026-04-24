/**
 * smoke/scenario5.ts — Multi shipment groups (Phase B #5).
 *
 * Seller: AISSA  (selected due to ADR-033 post-slash recovery gap;
 *                 CHIOMA remains stuck at Tier.None with 5 USDT orphan
 *                 as a scenario-4 artifact we document but don't fix.)
 * Buyer:  MAMADOU
 * 5 items × 18 USDT = 90 USDT cross-border
 * Groups: group1 (items 1-3), group2 (items 4-5)
 *
 * Pre-setup (step 0):
 *   - DEPLOYER → AISSA: +0.3 CELO top-up
 *   - AISSA: approve(stake, 10) + depositStake(Starter)
 *
 * Flow:
 *   1-3. MAMADOU: approve(escrow, 90) + create + fund
 *   4. AISSA shipItemsGrouped(items 1-3, proof1) → group1, 20%×3=10.5084 net
 *   5. AISSA shipItemsGrouped(items 4-5, proof2) → group2, 20%×2=7.0056 net
 *      status after step 5: AllShipped (5/5)
 *   6. AISSA markGroupArrived(group1) → items 1-3 Arrived
 *   7. MAMADOU confirmGroupDelivery(group1) → items 1-3 Released
 *      +3 × 14.0112 net AISSA, +3 × 0.486 treasury, status → PartiallyDelivered
 *   8. AISSA markGroupArrived(group2) → items 4-5 Arrived
 *   9. MAMADOU confirmGroupDelivery(group2) → items 4-5 Released
 *      +2 × 14.0112 net AISSA, +2 × 0.486 treasury, status → Completed
 *      stake.decrementActiveSales(AISSA) → 0
 *
 * Validates: Phase 3 (multi-groups per order), Phase 5 (sibling release
 * across groups independently).
 */
import { keccak256, parseAbi, parseEther, toBytes } from "viem";
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
  "function confirmGroupDelivery(uint256 orderId, uint256 groupId)",
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
  "function getActiveSales(address seller) view returns (uint256)",
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

async function main() {
  const startedAt = new Date().toISOString();
  const dep = loadDeployments();
  const w = loadTestWallets();
  const pub = makePublicClient();
  const wDeployer = makeWalletClient(w.deployer);
  const wAissa = makeWalletClient(w.aissa);
  const wMamadou = makeWalletClient(w.mamadou);

  console.log(`=== Scenario 5 — Multi shipment groups (AISSA seller) ===`);
  console.log(`RPC:     ${safeRpcUrl()}`);
  console.log(`Seller:  AISSA    ${w.aissa.address}`);
  console.log(`Buyer:   MAMADOU  ${w.mamadou.address}`);
  console.log(`Escrow:  ${dep.addresses.escrow}`);
  console.log(`Stake:   ${dep.addresses.stake}\n`);

  // ---------- Expected amounts (5 × 18 USDT, 2.7% cross-border) ----------
  const perItem = usdt(18);
  const total = usdt(90);
  const commissionPerItem = (perItem * 27n) / 1000n;             // 0.486
  const netPerItem = perItem - commissionPerItem;                 // 17.514
  const shipNetPerItem = (perItem * 20n * 973n) / (100n * 1000n); // 3.5028
  const confirmNetPerItem = netPerItem - shipNetPerItem;          // 14.0112
  const stakeAmount = usdt(10);

  const shipGroup1 = shipNetPerItem * 3n;  // 10.5084
  const shipGroup2 = shipNetPerItem * 2n;  // 7.0056
  const confirmGroup1Seller = confirmNetPerItem * 3n; // 42.0336
  const confirmGroup2Seller = confirmNetPerItem * 2n; // 28.0224
  const confirmGroup1Commission = commissionPerItem * 3n; // 1.458
  const confirmGroup2Commission = commissionPerItem * 2n; // 0.972

  const aissaDeltaExpected = shipGroup1 + shipGroup2 + confirmGroup1Seller + confirmGroup2Seller - stakeAmount; // +87.57 - 10 = +77.57
  const aissaScenarioReceipt = shipGroup1 + shipGroup2 + confirmGroup1Seller + confirmGroup2Seller; // +87.57 (excluding the stake outflow)
  const treasuryDeltaExpected = confirmGroup1Commission + confirmGroup2Commission; // 2.43
  const mamadouDeltaExpected = -total; // -90

  console.log(`Expected (USDT):`);
  console.log(`  ship group1 (3 items): +${fromUsdt(shipGroup1)}`);
  console.log(`  ship group2 (2 items): +${fromUsdt(shipGroup2)}`);
  console.log(`  confirm group1 net:    +${fromUsdt(confirmGroup1Seller)}`);
  console.log(`  confirm group2 net:    +${fromUsdt(confirmGroup2Seller)}`);
  console.log(`  total AISSA release:   +${fromUsdt(aissaScenarioReceipt)} (excluding −10 stake)`);
  console.log(`  AISSA net delta:       ${fromUsdt(aissaDeltaExpected)} (including stake)`);
  console.log(`  MAMADOU delta:         ${fromUsdt(mamadouDeltaExpected)}`);
  console.log(`  Treasury delta:        +${fromUsdt(treasuryDeltaExpected)}`);
  console.log(`  Conservation:          ${fromUsdt(aissaScenarioReceipt + mamadouDeltaExpected + treasuryDeltaExpected)}\n`);

  // ---------- Step 0a: CELO top-up AISSA ----------
  console.log(`--- Step 0a: DEPLOYER → AISSA +0.3 CELO ---`);
  const aissaCeloBefore = await pub.getBalance({ address: w.aissa.address as `0x${string}` });
  if (aissaCeloBefore >= parseEther("0.3")) {
    console.log(`  [SKIP] AISSA already has ${Number(aissaCeloBefore) / 1e18} CELO`);
  } else {
    const gp = await pub.getGasPrice();
    const topupHash = await wDeployer.sendTransaction({
      to: w.aissa.address as `0x${string}`,
      value: parseEther("0.3"),
      type: "legacy" as any, gasPrice: gp, gas: 21_000n,
    } as any);
    await pub.waitForTransactionReceipt({ hash: topupHash });
    const aissaCeloAfter = await pub.getBalance({ address: w.aissa.address as `0x${string}` });
    console.log(`  [OK] top-up tx=${topupHash}  AISSA balance=${Number(aissaCeloAfter) / 1e18} CELO`);
  }

  // ---------- Step 0b: AISSA approve + depositStake ----------
  const aissaTierBefore = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getTier", args: [w.aissa.address],
  })) as number;
  const preSetupTxs: any = { topup: null, approveStake: null, depositStake: null };
  if (aissaTierBefore !== 0) {
    console.log(`\n--- Step 0b: AISSA already at tier ${aissaTierBefore}, skipping stake setup ---`);
  } else {
    console.log(`\n--- Step 0b: AISSA approve(stake, 10) + depositStake(Starter) ---`);
    const txApproveStake = await sendTxWithEstimate(
      pub, wAissa, dep.addresses.usdt, erc20Abi, "approve",
      [dep.addresses.stake, stakeAmount], "USDT.approve(stake,10)",
    );
    preSetupTxs.approveStake = txApproveStake.hash;
    const txDepositStake = await sendTxWithEstimate(
      pub, wAissa, dep.addresses.stake, stakeAbi, "depositStake",
      [1], "depositStake(Starter)",
    );
    preSetupTxs.depositStake = txDepositStake.hash;
    const stakeEvt = captureEventFromReceipt<any>(txDepositStake.receipt, "StakeDeposited", stakeAbi);
    assertOrThrow(stakeEvt !== null, "StakeDeposited event missing");
    console.log(`  → AISSA tier=${stakeEvt!.tier} amount=${fromUsdt(stakeEvt!.amount)} USDT`);
  }

  // Verify AISSA post-setup
  const aissaTier = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getTier", args: [w.aissa.address],
  })) as number;
  const aissaStake = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getStake", args: [w.aissa.address],
  })) as bigint;
  assertOrThrow(Number(aissaTier) === 1, "AISSA must be at Starter after pre-setup",
    { actual: aissaTier, expected: 1 });
  assertOrThrow(aissaStake === stakeAmount, "AISSA stake must be 10 USDT",
    { actual: fromUsdt(aissaStake), expected: 10 });

  // ---------- Snapshot BEFORE scenario flow ----------
  console.log(`\n--- Snapshot BEFORE (post pre-setup) ---`);
  const watched = {
    aissa: w.aissa.address as `0x${string}`,
    mamadou: w.mamadou.address as `0x${string}`,
    chioma: w.chioma.address as `0x${string}`,
    treasury: dep.addresses.commissionTreasury,
    escrow: dep.addresses.escrow,
    stake: dep.addresses.stake,
  };
  const before = await snapshotBalances(pub, watched, dep.addresses.usdt);
  for (const [k, v] of Object.entries(before)) {
    console.log(`  ${k.padEnd(10)}  ${fromUsdt(v).toFixed(2)} USDT`);
  }
  const repBefore = (await pub.readContract({
    address: dep.addresses.reputation, abi: reputationAbi,
    functionName: "getReputation", args: [w.aissa.address],
  })) as { ordersCompleted: bigint };
  console.log(`  AISSA.reputation.ordersCompleted=${repBefore.ordersCompleted}`);

  // ---------- Step 1: MAMADOU approve(escrow, 90) ----------
  console.log(`\n--- Step 1: MAMADOU approve(escrow, 90) ---`);
  const txApprove = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.usdt, erc20Abi, "approve",
    [dep.addresses.escrow, total], "USDT.approve(escrow,90)",
  );

  // ---------- Step 2: createOrderWithItems ----------
  console.log(`\n--- Step 2: MAMADOU createOrderWithItems([18×5], cross-border) ---`);
  const txCreate = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "createOrderWithItems",
    [w.aissa.address, [perItem, perItem, perItem, perItem, perItem], true],
    "createOrder(5×18)",
  );
  const created = captureEventFromReceipt<any>(txCreate.receipt, "OrderCreated", escrowAbi);
  assertOrThrow(created !== null, "OrderCreated missing");
  const orderId = created!.orderId as bigint;
  const itemIds = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi,
    functionName: "getOrderItems", args: [orderId],
  })) as bigint[];
  assertOrThrow(itemIds.length === 5, "expected 5 items");
  const [i1, i2, i3, i4, i5] = itemIds;
  console.log(`  → orderId=${orderId}  items=[${itemIds.join(", ")}]`);

  // ---------- Step 3: fundOrder ----------
  console.log(`\n--- Step 3: MAMADOU fundOrder(${orderId}) ---`);
  const txFund = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "fundOrder",
    [orderId], `fundOrder(${orderId})`,
  );

  // ---------- Step 4: ship group1 (items 1-3) ----------
  console.log(`\n--- Step 4: AISSA shipItemsGrouped(group1 = [${i1}, ${i2}, ${i3}]) ---`);
  const txShip1 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "shipItemsGrouped",
    [orderId, [i1, i2, i3], keccak256(toBytes("scenario5-ship-group1"))],
    "shipItemsGrouped(group1)",
  );
  const ship1 = captureEventFromReceipt<any>(txShip1.receipt, "ShipmentGroupCreated", escrowAbi);
  const g1Id = ship1!.groupId as bigint;
  const partial1 = captureEventFromReceipt<any>(txShip1.receipt, "PartialReleaseTriggered", escrowAbi);
  console.log(`  → groupId=${g1Id}  partialRelease=${fromUsdt(partial1!.amount)} USDT`);
  const afterShip1 = await snapshotBalances(pub, watched, dep.addresses.usdt);

  // Verify order status after ship1 = PartiallyShipped (2)
  const orderAfterShip1 = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi, functionName: "getOrder", args: [orderId],
  })) as { globalStatus: number };
  console.log(`  → order.globalStatus after ship1: ${orderAfterShip1.globalStatus} (expect 2=PartiallyShipped)`);

  // ---------- Step 5: ship group2 (items 4-5) ----------
  console.log(`\n--- Step 5: AISSA shipItemsGrouped(group2 = [${i4}, ${i5}]) ---`);
  const txShip2 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "shipItemsGrouped",
    [orderId, [i4, i5], keccak256(toBytes("scenario5-ship-group2"))],
    "shipItemsGrouped(group2)",
  );
  const ship2 = captureEventFromReceipt<any>(txShip2.receipt, "ShipmentGroupCreated", escrowAbi);
  const g2Id = ship2!.groupId as bigint;
  const partial2 = captureEventFromReceipt<any>(txShip2.receipt, "PartialReleaseTriggered", escrowAbi);
  console.log(`  → groupId=${g2Id}  partialRelease=${fromUsdt(partial2!.amount)} USDT`);
  const afterShip2 = await snapshotBalances(pub, watched, dep.addresses.usdt);

  const orderAfterShip2 = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi, functionName: "getOrder", args: [orderId],
  })) as { globalStatus: number };
  console.log(`  → order.globalStatus after ship2: ${orderAfterShip2.globalStatus} (expect 3=AllShipped)`);

  // ---------- Step 6: markGroupArrived(group1) ----------
  console.log(`\n--- Step 6: AISSA markGroupArrived(group1) ---`);
  const txArrive1 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "markGroupArrived",
    [orderId, g1Id, keccak256(toBytes("scenario5-arrive-group1"))],
    "markGroupArrived(group1)",
  );

  // ---------- Step 7: confirmGroupDelivery(group1) ----------
  console.log(`\n--- Step 7: MAMADOU confirmGroupDelivery(group1) → items 1-3 Released ---`);
  const txConfirm1 = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "confirmGroupDelivery",
    [orderId, g1Id], "confirmGroupDelivery(group1)",
  );
  const rel1 = captureAllEventsFromReceipt<any>(txConfirm1.receipt, "ItemReleased", escrowAbi);
  console.log(`  → ${rel1.length} ItemReleased events (expect 3)`);
  const afterConfirm1 = await snapshotBalances(pub, watched, dep.addresses.usdt);

  const orderAfterConfirm1 = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi, functionName: "getOrder", args: [orderId],
  })) as { globalStatus: number };
  console.log(`  → order.globalStatus after confirm1: ${orderAfterConfirm1.globalStatus} (expect 4=PartiallyDelivered)`);

  // ---------- Step 8: markGroupArrived(group2) ----------
  console.log(`\n--- Step 8: AISSA markGroupArrived(group2) ---`);
  const txArrive2 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "markGroupArrived",
    [orderId, g2Id, keccak256(toBytes("scenario5-arrive-group2"))],
    "markGroupArrived(group2)",
  );

  // ---------- Step 9: confirmGroupDelivery(group2) → order Completed ----------
  console.log(`\n--- Step 9: MAMADOU confirmGroupDelivery(group2) → items 4-5 Released, OrderCompleted ---`);
  const txConfirm2 = await sendTxWithEstimate(
    pub, wMamadou, dep.addresses.escrow, escrowAbi, "confirmGroupDelivery",
    [orderId, g2Id], "confirmGroupDelivery(group2)",
  );
  const rel2 = captureAllEventsFromReceipt<any>(txConfirm2.receipt, "ItemReleased", escrowAbi);
  const orderCompletedEvt = captureEventFromReceipt<any>(txConfirm2.receipt, "OrderCompleted", escrowAbi);
  console.log(`  → ${rel2.length} ItemReleased events (expect 2)`);
  console.log(`  → OrderCompleted emitted: ${orderCompletedEvt !== null}`);

  // ---------- Snapshot AFTER ----------
  console.log(`\n--- Snapshot AFTER ---`);
  const after = await snapshotBalances(pub, watched, dep.addresses.usdt);
  for (const [k, v] of Object.entries(after)) {
    console.log(`  ${k.padEnd(10)}  ${fromUsdt(v).toFixed(2)} USDT`);
  }
  const diffs = computeBalanceDiffs(before, after);

  // Intermediate deltas
  const ship1Diffs = computeBalanceDiffs(before, afterShip1);
  const ship2Diffs = computeBalanceDiffs(afterShip1, afterShip2);
  const confirm1Diffs = computeBalanceDiffs(afterShip2, afterConfirm1);

  // ---------- Assertions ----------
  console.log(`\n--- Assertions ---`);
  const failures: string[] = [];
  const dust = 2n;
  const absDiff = (a: bigint, b: bigint) => (a > b ? a - b : b - a);
  function check(label: string, cond: boolean, extra?: string) {
    if (cond) console.log(`  [OK]   ${label}${extra ? "  " + extra : ""}`);
    else { console.log(`  [FAIL] ${label}${extra ? "  " + extra : ""}`); failures.push(label); }
  }

  // Total balance deltas
  check("AISSA total delta (+87.57 releases, seller role)",
    absDiff(diffs.aissa, aissaScenarioReceipt) <= dust,
    `actual=${fromUsdt(diffs.aissa)} expected=+${fromUsdt(aissaScenarioReceipt)}`);
  check("MAMADOU total delta (−90)",
    absDiff(diffs.mamadou, mamadouDeltaExpected) <= dust,
    `actual=${fromUsdt(diffs.mamadou)} expected=${fromUsdt(mamadouDeltaExpected)}`);
  check("Treasury delta (+2.43)",
    absDiff(diffs.treasury, treasuryDeltaExpected) <= dust,
    `actual=${fromUsdt(diffs.treasury)} expected=+${fromUsdt(treasuryDeltaExpected)}`);
  check("Escrow delta (net zero)",
    absDiff(diffs.escrow, 0n) <= dust,
    `actual=${fromUsdt(diffs.escrow)}`);
  check("Stake contract delta (0 — AISSA already staked pre-scenario)",
    absDiff(diffs.stake, 0n) <= dust,
    `actual=${fromUsdt(diffs.stake)}`);
  check("CHIOMA state UNCHANGED (ADR-033 orphan observed only)",
    diffs.chioma === 0n,
    `delta=${fromUsdt(diffs.chioma)}`);

  // Intermediate ship amounts
  check("ship group1 → AISSA +10.5084",
    absDiff(ship1Diffs.aissa, shipGroup1) <= dust,
    `actual=${fromUsdt(ship1Diffs.aissa)} expected=+${fromUsdt(shipGroup1)}`);
  check("ship group2 → AISSA +7.0056",
    absDiff(ship2Diffs.aissa, shipGroup2) <= dust,
    `actual=${fromUsdt(ship2Diffs.aissa)} expected=+${fromUsdt(shipGroup2)}`);
  check("confirm group1 → AISSA +42.0336 + Treasury +1.458",
    absDiff(confirm1Diffs.aissa, confirmGroup1Seller) <= dust
      && absDiff(confirm1Diffs.treasury, confirmGroup1Commission) <= dust,
    `aissa=${fromUsdt(confirm1Diffs.aissa)} treasury=${fromUsdt(confirm1Diffs.treasury)}`);

  // Status transitions
  check("status after ship1 == PartiallyShipped(2)",
    Number(orderAfterShip1.globalStatus) === 2, `got=${orderAfterShip1.globalStatus}`);
  check("status after ship2 == AllShipped(3)",
    Number(orderAfterShip2.globalStatus) === 3, `got=${orderAfterShip2.globalStatus}`);
  check("status after confirm1 == PartiallyDelivered(4)",
    Number(orderAfterConfirm1.globalStatus) === 4, `got=${orderAfterConfirm1.globalStatus}`);

  const orderFinal = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi, functionName: "getOrder", args: [orderId],
  })) as { globalStatus: number };
  check("final order.globalStatus == Completed(5)",
    Number(orderFinal.globalStatus) === 5, `status=${orderFinal.globalStatus}`);

  // All items Released
  const itemStatuses: number[] = [];
  for (const iid of itemIds) {
    const it = (await pub.readContract({
      address: dep.addresses.escrow, abi: escrowAbi, functionName: "getItem", args: [iid],
    })) as { status: number };
    itemStatuses.push(Number(it.status));
  }
  check("all 5 items status == Released(4)",
    itemStatuses.every((s) => s === 4), `statuses=[${itemStatuses.join(",")}]`);

  // Stake state intact
  const aissaTierFinal = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getTier", args: [w.aissa.address],
  })) as number;
  const aissaStakeFinal = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getStake", args: [w.aissa.address],
  })) as bigint;
  const aissaActiveSales = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getActiveSales", args: [w.aissa.address],
  })) as bigint;
  check("AISSA.tier == Starter(1) intact", Number(aissaTierFinal) === 1,
    `tier=${aissaTierFinal}`);
  check("AISSA.stake == 10 USDT intact", aissaStakeFinal === stakeAmount,
    `stake=${fromUsdt(aissaStakeFinal)}`);
  check("AISSA.activeSales == 0 (order completed)", aissaActiveSales === 0n,
    `activeSales=${aissaActiveSales}`);

  // Events
  const allLogs = [
    ...txCreate.receipt.logs, ...txFund.receipt.logs,
    ...txShip1.receipt.logs, ...txShip2.receipt.logs,
    ...txArrive1.receipt.logs, ...txConfirm1.receipt.logs,
    ...txArrive2.receipt.logs, ...txConfirm2.receipt.logs,
  ];
  const combined: any = { logs: allLogs };
  const expected = [
    "OrderCreated", "OrderFunded",
    "ShipmentGroupCreated", "PartialReleaseTriggered",
    "GroupArrived", "ItemReleased", "ItemCompleted", "OrderCompleted",
  ];
  const ev = verifyAllEventsEmitted(combined, expected, escrowAbi);
  check("all expected events present", ev.missing.length === 0,
    `missing=[${ev.missing.join(",")}]`);
  const allReleased = captureAllEventsFromReceipt(combined, "ItemReleased", escrowAbi);
  check("ItemReleased × 5 total across confirms", allReleased.length === 5,
    `count=${allReleased.length}`);
  const allShipGroupEvents = captureAllEventsFromReceipt(combined, "ShipmentGroupCreated", escrowAbi);
  check("ShipmentGroupCreated × 2 (group1, group2)", allShipGroupEvents.length === 2,
    `count=${allShipGroupEvents.length}`);

  // Reputation AISSA
  const repAfter = (await pub.readContract({
    address: dep.addresses.reputation, abi: reputationAbi,
    functionName: "getReputation", args: [w.aissa.address],
  })) as { ordersCompleted: bigint };
  const repDelta = repAfter.ordersCompleted - repBefore.ordersCompleted;
  check("AISSA.reputation.ordersCompleted += 5", repDelta === 5n, `delta=${repDelta}`);

  // ---------- Save ----------
  const endedAt = new Date().toISOString();
  const result = {
    scenario: "5 — Multi shipment groups (seller=AISSA)",
    note: "seller=AISSA due to ADR-033 post-slash-recovery gap. CHIOMA remains in Tier.None with 5 USDT orphan as scenario 4 artifact (documented in ADR-033).",
    startedAt, endedAt,
    wallets: {
      seller: w.aissa.address, buyer: w.mamadou.address,
      chioma_unchanged: w.chioma.address,
    },
    preSetup: preSetupTxs,
    order: { orderId, itemIds, groups: { g1: g1Id, g2: g2Id }, isCrossBorder: true, total },
    txs: {
      approve: txApprove.hash, create: txCreate.hash, fund: txFund.hash,
      ship1: txShip1.hash, ship2: txShip2.hash,
      arrive1: txArrive1.hash, confirm1: txConfirm1.hash,
      arrive2: txArrive2.hash, confirm2: txConfirm2.hash,
    },
    gasUsed: {
      approve: txApprove.gasUsed, create: txCreate.gasUsed, fund: txFund.gasUsed,
      ship1: txShip1.gasUsed, ship2: txShip2.gasUsed,
      arrive1: txArrive1.gasUsed, confirm1: txConfirm1.gasUsed,
      arrive2: txArrive2.gasUsed, confirm2: txConfirm2.gasUsed,
    },
    balances: {
      before: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, fromUsdt(v)])),
      afterShip1: Object.fromEntries(Object.entries(afterShip1).map(([k, v]) => [k, fromUsdt(v)])),
      afterShip2: Object.fromEntries(Object.entries(afterShip2).map(([k, v]) => [k, fromUsdt(v)])),
      afterConfirm1: Object.fromEntries(Object.entries(afterConfirm1).map(([k, v]) => [k, fromUsdt(v)])),
      after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, fromUsdt(v)])),
      deltas: Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, fromUsdt(v)])),
    },
    expected: {
      shipGroup1: fromUsdt(shipGroup1),
      shipGroup2: fromUsdt(shipGroup2),
      confirmGroup1Seller: fromUsdt(confirmGroup1Seller),
      confirmGroup2Seller: fromUsdt(confirmGroup2Seller),
      treasuryTotal: fromUsdt(treasuryDeltaExpected),
    },
    statusTransitions: {
      afterShip1: orderAfterShip1.globalStatus,
      afterShip2: orderAfterShip2.globalStatus,
      afterConfirm1: orderAfterConfirm1.globalStatus,
      final: orderFinal.globalStatus,
    },
    finalStatus: {
      orderGlobalStatus: Number(orderFinal.globalStatus),
      itemStatuses,
      aissaTier: aissaTierFinal,
      aissaStake: fromUsdt(aissaStakeFinal),
      aissaActiveSales,
      reputationCompletedDelta: Number(repDelta),
    },
    events: {
      itemReleasedCount: allReleased.length,
      shipmentGroupCreatedCount: allShipGroupEvents.length,
      missing: ev.missing,
    },
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures,
  };
  const outPath = saveScenarioResult("scenario5", result);
  console.log(`\nSaved: ${outPath}`);

  if (failures.length) {
    console.error(`\n❌ Scenario 5 FAIL — ${failures.length} failures:`);
    for (const f of failures) console.error(`  - ${f}`);
    throw new Error("Scenario 5 FAIL");
  }
  console.log(`\n✅ Scenario 5 PASS`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
});
