/**
 * smoke/cleanup-order7.ts — Post-scenario-3 dangling-state cleanup.
 *
 * Order 7 was created during the first (crashed) run of scenario 3.
 * Items 9, 11 remain in Arrived status (never confirmed); item 10
 * was resolved via dispute. This script confirms items 9 and 11 so
 * that:
 *   - 48.32 USDT locked in escrow for these two items is released
 *   - order 7 transitions to Completed
 *   - CHIOMA.activeSales decrements back to 0
 *
 * NOT part of the scenario test suite — this is operational hygiene.
 *
 * Usage:
 *   npx hardhat run scripts/smoke/cleanup-order7.ts --network celoSepolia
 */
import { parseAbi } from "viem";
import {
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
} from "./helpers.js";

const ORDER_ID = 7n;
const ITEM_IDS = [9n, 11n];

const escrowAbi = parseAbi([
  "struct Order { uint256 orderId; address buyer; address seller; uint256 totalAmount; uint256 totalCommission; uint256 createdAt; uint256 fundedAt; bool isCrossBorder; uint8 globalStatus; uint256 itemCount; uint256 shipmentGroupCount; }",
  "struct Item { uint256 itemId; uint256 orderId; uint256 itemPrice; uint256 itemCommission; uint256 shipmentGroupId; uint256 releasedAmount; uint8 status; }",
  "function confirmItemDelivery(uint256 orderId, uint256 itemId)",
  "function getOrder(uint256 orderId) view returns (Order)",
  "function getItem(uint256 itemId) view returns (Item)",
]);

const stakeAbi = parseAbi([
  "function getActiveSales(address seller) view returns (uint256)",
]);

async function main() {
  const dep = loadDeployments();
  const w = loadTestWallets();
  const pub = makePublicClient();
  const wMamadou = makeWalletClient(w.mamadou);

  console.log(`=== Cleanup Order ${ORDER_ID} — confirm items ${ITEM_IDS.join(", ")} ===`);
  console.log(`RPC: ${safeRpcUrl()}\n`);

  // Read order state
  const order = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi,
    functionName: "getOrder", args: [ORDER_ID],
  })) as { buyer: `0x${string}`; seller: `0x${string}`; globalStatus: number; itemCount: bigint };
  console.log(`Order ${ORDER_ID}: buyer=${order.buyer}  seller=${order.seller}  status=${order.globalStatus}  items=${order.itemCount}`);

  // Verify item statuses before
  for (const iid of ITEM_IDS) {
    const it = (await pub.readContract({
      address: dep.addresses.escrow, abi: escrowAbi,
      functionName: "getItem", args: [iid],
    })) as { status: number; releasedAmount: bigint };
    console.log(`  item ${iid}: status=${it.status} releasedAmount=${fromUsdt(it.releasedAmount)} USDT`);
  }

  const watched = {
    chioma: w.chioma.address as `0x${string}`,
    mamadou: w.mamadou.address as `0x${string}`,
    treasury: dep.addresses.commissionTreasury,
    escrow: dep.addresses.escrow,
  };

  const before = await snapshotBalances(pub, watched, dep.addresses.usdt);
  const activeSalesBefore = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getActiveSales", args: [w.chioma.address],
  })) as bigint;
  console.log(`\nBalances BEFORE: ${JSON.stringify(Object.fromEntries(Object.entries(before).map(([k, v]) => [k, fromUsdt(v)])))}`);
  console.log(`CHIOMA.activeSales before: ${activeSalesBefore}`);

  // Confirm each item
  const txs: Record<string, { hash: string; gasUsed: bigint }> = {};
  for (const iid of ITEM_IDS) {
    console.log(`\n--- confirmItemDelivery(${ORDER_ID}, ${iid}) ---`);
    const tx = await sendTxWithEstimate(
      pub, wMamadou, dep.addresses.escrow, escrowAbi, "confirmItemDelivery",
      [ORDER_ID, iid], `confirmItemDelivery(${iid})`,
    );
    txs[`item${iid}`] = { hash: tx.hash, gasUsed: tx.gasUsed };
  }

  const after = await snapshotBalances(pub, watched, dep.addresses.usdt);
  const diffs = computeBalanceDiffs(before, after);
  const activeSalesAfter = (await pub.readContract({
    address: dep.addresses.stake, abi: stakeAbi,
    functionName: "getActiveSales", args: [w.chioma.address],
  })) as bigint;

  // Read final order status
  const orderAfter = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi,
    functionName: "getOrder", args: [ORDER_ID],
  })) as { globalStatus: number };

  console.log(`\nBalances AFTER: ${JSON.stringify(Object.fromEntries(Object.entries(after).map(([k, v]) => [k, fromUsdt(v)])))}`);
  console.log(`Deltas: ${JSON.stringify(Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, fromUsdt(v)])))}`);
  console.log(`\nOrder ${ORDER_ID} globalStatus: ${order.globalStatus} → ${orderAfter.globalStatus} (5=Completed)`);
  console.log(`CHIOMA.activeSales: ${activeSalesBefore} → ${activeSalesAfter}`);

  const result = {
    note: "cleanup operation post-scenario 3, not part of scenario test suite",
    timestamp: new Date().toISOString(),
    orderId: ORDER_ID,
    itemsConfirmed: ITEM_IDS,
    buyer: order.buyer,
    seller: order.seller,
    txs,
    balances: {
      before: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, fromUsdt(v)])),
      after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, fromUsdt(v)])),
      deltas: Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, fromUsdt(v)])),
    },
    stake: {
      activeSalesBefore,
      activeSalesAfter,
    },
    order: {
      statusBefore: order.globalStatus,
      statusAfter: orderAfter.globalStatus,
    },
  };
  const outPath = saveScenarioResult("cleanup-order7", result);
  console.log(`\nSaved: ${outPath}`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
});
