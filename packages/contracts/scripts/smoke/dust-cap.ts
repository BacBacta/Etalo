/**
 * smoke/dust-cap.ts — Pashov audit finding #4 live regression
 * on Celo Sepolia v1.3-audit-fixes deploy (ADR-054).
 *
 * Pre-fix: createOrderWithItems' last-item dust absorber was unbounded.
 *          With 49 items @ 55 wei + 1 item @ 1 wei (totalAmount=2696
 *          wei, totalCommission=48 wei intra-1.8%), each first-49
 *          item's pro-rata commission rounded to 0 (55 × 48 / 2696 = 0),
 *          and the entire 48 wei totalCommission accumulated on the
 *          last item via the dust line. Result: itemCommission=48 on
 *          itemPrice=1, so itemNet = itemPrice - itemCommission = 1-48
 *          underflowed in 0.8 and every release path reverted forever.
 *
 * Post-fix: createOrderWithItems caps the last-item dust absorber at
 *           itemPrice so itemCommission <= itemPrice always holds.
 *
 * This script proves the cap is live in the deployed v1.3 EtaloEscrow
 * bytecode by constructing the attack shape on chain and reading the
 * resulting Item record back.
 *
 * Trade-off note: with the cap, a few wei of commission stay locked
 * in escrow forever on adversarial inputs — accepted per ADR-054.
 *
 * Usage:
 *   cd packages/contracts
 *   npx hardhat run scripts/smoke/dust-cap.ts --network celoSepolia
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseAbi,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";

const RPC_URL = process.env.CELO_SEPOLIA_RPC ?? "https://celo-sepolia.drpc.org";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
});

const escrowAbi = parseAbi([
  "function createOrderWithItems(address seller, uint256[] itemPrices, bool isCrossBorder) returns (uint256)",
  "function getOrderItems(uint256 orderId) view returns (uint256[])",
  "function getItem(uint256 itemId) view returns (uint256 itemId_, uint256 orderId, uint256 itemPrice, uint256 itemCommission, uint256 shipmentGroupId, uint256 releasedAmount, uint8 status)",
  "function getOrder(uint256 orderId) view returns (uint256 orderId_, address buyer, address seller, uint256 totalAmount, uint256 totalCommission, uint256 createdAt, uint256 fundedAt, bool isCrossBorder, uint8 globalStatus, uint256 itemCount, uint256 shipmentGroupCount)",
]);

function parseEnv(): Record<string, string> {
  const content = fs.readFileSync(".env", "utf8");
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function fmtTx(hash: string): string {
  return `https://celo-sepolia.blockscout.com/tx/${hash}`;
}

async function main() {
  const startedAt = new Date().toISOString();
  const env = parseEnv();
  const dep = JSON.parse(fs.readFileSync("deployments/celo-sepolia-v2.json", "utf8"));

  const ESCROW = dep.contracts.EtaloEscrow.address as `0x${string}`;

  const seller = privateKeyToAccount(`0x${env.TEST_CHIOMA_PK.replace(/^0x/, "")}`);
  // Buyer = deployer for this test — AISSA's CELO budget is too thin
  // for the 10-item create after the dispute-escalation smoke. The
  // attack shape only requires a successful createOrderWithItems
  // (no fund needed) — we read back the Item record. Deployer being
  // contract owner has no bearing on createOrderWithItems behaviour.
  const buyer = privateKeyToAccount(`0x${env.PRIVATE_KEY.replace(/^0x/, "")}`);

  const transport = http(RPC_URL);
  const pub = createPublicClient({ chain: celoSepolia, transport });
  const wBuyer = createWalletClient({ account: buyer, chain: celoSepolia, transport });

  console.log("=== Pashov #4 regression — dust commission cap ===");
  console.log(`Seller:     CHIOMA   ${seller.address}`);
  console.log(`Buyer:      Deployer ${buyer.address}`);
  console.log(`Escrow:     ${ESCROW}\n`);

  // ───────────────────────────────────────────────────────────
  // Construct the attack shape: 9 items @ 55 wei + 1 item @ 1 wei.
  // Smaller variant of the 49+1 unit-test shape — fits AISSA's CELO
  // budget on Sepolia (~1M gas vs 5M for 50 items). The cap path is
  // identical: each first-N item's pro-rata commission rounds to 0,
  // the entire totalCommission accumulates onto the last 1-wei item,
  // and without the cap the last item's commission would exceed its
  // price by 8x (8 wei commission vs 1 wei price).
  //
  // totalAmount = 9 × 55 + 1 = 496 wei
  // totalCommission (1.8% intra) = 496 × 180 / 10000 = 8 wei
  // First 9 items: 55 × 8 / 496 = 0.88 → 0 (truncated)
  // Last item (without cap): dust absorbs all 8 wei → commission > price.
  // Last item (with cap): commission = min(8, 1) = 1 wei.
  // ───────────────────────────────────────────────────────────
  const prices: bigint[] = [];
  for (let i = 0; i < 9; i++) prices.push(55n);
  prices.push(1n);

  console.log(`Attack shape: 9 items @ 55 wei + 1 item @ 1 wei`);
  console.log(`  totalAmount = ${prices.reduce((a, b) => a + b, 0n)} wei`);
  console.log(`  intra commission BPS = 180 (1.8%)`);
  const totalAmount = prices.reduce((a, b) => a + b, 0n);
  const totalCommission = (totalAmount * 180n) / 10000n;
  console.log(`  expected totalCommission = ${totalCommission} wei`);
  console.log(`  WITHOUT cap, lastItemCommission would = ${totalCommission} wei (${Number(totalCommission)}× lastItemPrice 1)\n`);

  // ───────────────────────────────────────────────────────────
  // Step 1: createOrderWithItems with the attack shape
  // ───────────────────────────────────────────────────────────
  console.log(`--- Step 1: Buyer createOrderWithItems(CHIOMA, [55×9, 1], intra) ---`);

  let createHash: `0x${string}`;
  try {
    // Explicit gas — 50-item createOrder writes ~50 Item structs +
    // 1 Order struct + 50 _orderItems[orderId].push, well past
    // viem's default auto-estimate cap.
    createHash = await wBuyer.writeContract({
      address: ESCROW, abi: escrowAbi, functionName: "createOrderWithItems",
      args: [seller.address, prices, false],
      gas: 1_500_000n,
    });
  } catch (e) {
    console.log(`\n❌ FATAL — createOrderWithItems reverted unexpectedly:`);
    console.log(`     ${(e as Error).message.split("\n")[0]}`);
    console.log(`   (This is not the expected pre-fix behavior either — investigate.)`);
    process.exitCode = 1;
    return;
  }
  const createReceipt = await pub.waitForTransactionReceipt({ hash: createHash });
  const orderCreatedTopic = keccak256(toBytes("OrderCreated(uint256,address,address,uint256,bool,uint256)"));
  const log = createReceipt.logs.find((l) => l.topics[0] === orderCreatedTopic && l.address.toLowerCase() === ESCROW.toLowerCase());
  if (!log) throw new Error("OrderCreated event not found");
  const orderId = BigInt(log.topics[1]!);
  console.log(`  [OK] orderId=${orderId}  ${fmtTx(createHash)}`);

  // ───────────────────────────────────────────────────────────
  // Step 2: Read the last item — itemCommission must be <= itemPrice
  // ───────────────────────────────────────────────────────────
  const itemIds = (await pub.readContract({
    address: ESCROW, abi: escrowAbi, functionName: "getOrderItems", args: [orderId],
  })) as bigint[];
  const lastIdx = itemIds.length - 1;
  console.log(`\n--- Step 2: Verify cap on last item (itemId=${itemIds[lastIdx]}) ---`);

  const lastItem = (await pub.readContract({
    address: ESCROW, abi: escrowAbi, functionName: "getItem", args: [itemIds[lastIdx]],
  })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number];

  const lastItemPrice = lastItem[2];
  const lastItemCommission = lastItem[3];
  console.log(`  lastItemPrice      = ${lastItemPrice} wei`);
  console.log(`  lastItemCommission = ${lastItemCommission} wei  (expect ≤ ${lastItemPrice})`);

  // Sanity sweep across all 50 items
  let maxRatio = 0;
  let violations = 0;
  for (let i = 0; i < itemIds.length; i++) {
    const it = (await pub.readContract({
      address: ESCROW, abi: escrowAbi, functionName: "getItem", args: [itemIds[i]],
    })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number];
    if (it[3] > it[2]) {
      violations++;
      console.log(`  ❌ item ${i}: commission ${it[3]} > price ${it[2]}`);
    }
    const ratio = Number(it[3]) / Number(it[2]);
    if (ratio > maxRatio) maxRatio = ratio;
  }

  console.log(`\n  Sweep across all ${itemIds.length} items:`);
  console.log(`    Max commission/price ratio observed: ${maxRatio.toFixed(2)}  (expect ≤ 1.0)`);
  console.log(`    Items with commission > price: ${violations}  (expect 0)`);

  const passed = lastItemCommission <= lastItemPrice && violations === 0;

  if (passed) {
    console.log(`\n✅ Pashov #4 REGRESSION PASSED — dust cap is live on v1.3 deploy.`);
    console.log(`   Last item's commission capped at itemPrice (${lastItemCommission} wei vs price ${lastItemPrice} wei).`);
    console.log(`   No item across the 50-item attack shape violates the invariant.`);
  } else {
    console.log(`\n❌ Pashov #4 REGRESSION FAILED — cap is not live on the deployed bytecode.`);
    process.exitCode = 1;
  }

  const result = {
    scenario: "pashov-4-dust-cap-regression",
    tag: "v1.3-audit-fixes",
    adr: "ADR-054",
    startedAt,
    finishedAt: new Date().toISOString(),
    deploy: { escrow: ESCROW },
    actors: { seller: seller.address, buyer: buyer.address },
    orderId: orderId.toString(),
    attackShape: {
      itemCount: prices.length,
      pricesPreview: `[55, 55, ..., 55, 1] (${prices.length - 1} × 55 + 1 × 1)`,
      totalAmount: totalAmount.toString(),
      expectedTotalCommissionWithoutCap: totalCommission.toString(),
    },
    lastItem: {
      itemId: itemIds[lastIdx].toString(),
      price: lastItemPrice.toString(),
      commission: lastItemCommission.toString(),
      cappedCorrectly: lastItemCommission <= lastItemPrice,
    },
    sweep: {
      itemsChecked: itemIds.length,
      violations,
      maxRatio,
    },
    txs: { create: createHash },
    passed,
  };
  fs.writeFileSync("scripts/smoke/dust-cap-result.json", JSON.stringify(result, null, 2));
  console.log(`\nResult written to scripts/smoke/dust-cap-result.json`);
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exitCode = 1; });
