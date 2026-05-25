/**
 * smoke/sanction-regression.ts — Pashov audit finding #1 live regression
 * on Celo Sepolia v1.3-audit-fixes deploy (ADR-054).
 *
 * Pre-fix: applySanction on a seller with any in-flight Shipped item
 *          turned the next confirmItemDelivery / confirmGroupDelivery /
 *          triggerAutoReleaseForItem into a permanent revert via
 *          _releaseItemFully → reputation.recordCompletedOrder
 *          (which used to revert with "Seller not active").
 *
 * Post-fix: recordCompletedOrder silently no-ops for sanctioned sellers
 *           (ADR-054). Buyer can still confirm delivery, seller gets
 *           the net payout, item flips to Released.
 *
 * This script proves the fix is live in the deployed v1.3 bytecode by
 * running the exact attack shape end-to-end on Celo Sepolia.
 *
 * Roles:
 *   - Deployer  (PRIVATE_KEY) = owner of EtaloReputation, mints MockUSDT
 *   - CHIOMA              = seller (sanctioned mid-flight)
 *   - AISSA               = buyer (must succeed at confirm time)
 *
 * Usage:
 *   cd packages/contracts
 *   npx hardhat run scripts/smoke/sanction-regression.ts --network celoSepolia
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatUnits,
  http,
  keccak256,
  parseAbi,
  parseUnits,
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
  blockExplorers: {
    default: { name: "Blockscout", url: "https://celo-sepolia.blockscout.com" },
  },
  testnet: true,
});

// ─────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────
const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

const reputationAbi = parseAbi([
  "function applySanction(address seller, uint8 newStatus)",
  "function getReputation(address seller) view returns (uint256 ordersCompleted, uint256 ordersDisputed, uint256 disputesLost, uint256 totalVolume, uint256 score, bool isTopSeller, uint8 status, uint256 lastSanctionAt, uint256 firstOrderAt)",
]);

const escrowAbi = parseAbi([
  "function createOrderWithItems(address seller, uint256[] itemPrices, bool isCrossBorder) returns (uint256)",
  "function fundOrder(uint256 orderId)",
  "function shipItemsGrouped(uint256 orderId, uint256[] itemIds, bytes32 proofHash) returns (uint256)",
  "function confirmItemDelivery(uint256 orderId, uint256 itemId)",
  "function getOrderItems(uint256 orderId) view returns (uint256[])",
  "function getItem(uint256 itemId) view returns (uint256 itemId_, uint256 orderId, uint256 itemPrice, uint256 itemCommission, uint256 shipmentGroupId, uint256 releasedAmount, uint8 status)",
]);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
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

const ITEM_STATUS = ["Pending", "Shipped", "Arrived", "Delivered", "Released", "Refunded", "Disputed"];
const REP_STATUS = ["Active", "Suspended", "Banned"];

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  const startedAt = new Date().toISOString();
  const env = parseEnv();
  const dep = JSON.parse(fs.readFileSync("deployments/celo-sepolia-v2.json", "utf8"));

  const MOCK_USDT = dep.contracts.MockUSDT.address as `0x${string}`;
  const REPUTATION = dep.contracts.EtaloReputation.address as `0x${string}`;
  const ESCROW = dep.contracts.EtaloEscrow.address as `0x${string}`;
  const TREASURY = dep.treasuries.commission as `0x${string}`;

  const deployer = privateKeyToAccount(`0x${env.PRIVATE_KEY.replace(/^0x/, "")}`);
  const seller = privateKeyToAccount(`0x${env.TEST_CHIOMA_PK.replace(/^0x/, "")}`);
  const buyer = privateKeyToAccount(`0x${env.TEST_AISSA_PK.replace(/^0x/, "")}`);

  const transport = http(RPC_URL);
  const pub = createPublicClient({ chain: celoSepolia, transport });
  const wDeployer = createWalletClient({ account: deployer, chain: celoSepolia, transport });
  const wSeller = createWalletClient({ account: seller, chain: celoSepolia, transport });
  const wBuyer = createWalletClient({ account: buyer, chain: celoSepolia, transport });

  console.log("=== Pashov #1 regression — sanction-then-confirm on v1.3-audit-fixes ===");
  console.log(`RPC:        ${RPC_URL}`);
  console.log(`Deployer:   ${deployer.address}`);
  console.log(`Seller:     CHIOMA  ${seller.address}`);
  console.log(`Buyer:      AISSA   ${buyer.address}`);
  console.log(`MockUSDT:   ${MOCK_USDT}`);
  console.log(`Reputation: ${REPUTATION}`);
  console.log(`Escrow:     ${ESCROW}\n`);

  const ITEM_PRICE = parseUnits("5", 6); // 5 USDT

  // ───────────────────────────────────────────────────────────
  // Step 0: Ensure CHIOMA + AISSA have USDT
  // ───────────────────────────────────────────────────────────
  console.log("--- Step 0: Top-up USDT (deployer mints to seller + buyer) ---");
  for (const [name, addr] of [["CHIOMA", seller.address], ["AISSA", buyer.address]] as const) {
    const bal = (await pub.readContract({
      address: MOCK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [addr],
    })) as bigint;
    if (bal >= ITEM_PRICE * 2n) {
      console.log(`  [SKIP] ${name} has ${formatUnits(bal, 6)} USDT (≥ ${formatUnits(ITEM_PRICE * 2n, 6)})`);
      continue;
    }
    const mintAmount = parseUnits("20", 6);
    const hash = await wDeployer.writeContract({
      address: MOCK_USDT, abi: erc20Abi, functionName: "mint", args: [addr, mintAmount],
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  [OK] mint(${name}, 20 USDT)  ${fmtTx(hash)}`);
  }

  // ───────────────────────────────────────────────────────────
  // Step 1: Buyer approves + creates + funds order
  // ───────────────────────────────────────────────────────────
  console.log("\n--- Step 1: AISSA approve(escrow, 5 USDT) ---");
  const approveHash = await wBuyer.writeContract({
    address: MOCK_USDT, abi: erc20Abi, functionName: "approve", args: [ESCROW, ITEM_PRICE],
  });
  await pub.waitForTransactionReceipt({ hash: approveHash });
  console.log(`  [OK] ${fmtTx(approveHash)}`);

  console.log("\n--- Step 2: AISSA createOrderWithItems(CHIOMA, [5 USDT], intra) ---");
  const createHash = await wBuyer.writeContract({
    address: ESCROW, abi: escrowAbi, functionName: "createOrderWithItems",
    args: [seller.address, [ITEM_PRICE], false],
  });
  const createReceipt = await pub.waitForTransactionReceipt({ hash: createHash });
  console.log(`  [OK] ${fmtTx(createHash)}  block=${createReceipt.blockNumber}`);

  // Parse OrderCreated event for orderId
  const orderCreatedTopic = keccak256(toBytes("OrderCreated(uint256,address,address,uint256,bool,uint256)"));
  const log = createReceipt.logs.find((l) => l.topics[0] === orderCreatedTopic && l.address.toLowerCase() === ESCROW.toLowerCase());
  if (!log) throw new Error("OrderCreated event not found");
  const orderId = BigInt(log.topics[1]!);
  console.log(`  → orderId = ${orderId}`);

  console.log("\n--- Step 3: AISSA fundOrder ---");
  const fundHash = await wBuyer.writeContract({
    address: ESCROW, abi: escrowAbi, functionName: "fundOrder", args: [orderId],
  });
  await pub.waitForTransactionReceipt({ hash: fundHash });
  console.log(`  [OK] ${fmtTx(fundHash)}`);

  // ───────────────────────────────────────────────────────────
  // Step 4: Seller ships
  // ───────────────────────────────────────────────────────────
  const itemIds = (await pub.readContract({
    address: ESCROW, abi: escrowAbi, functionName: "getOrderItems", args: [orderId],
  })) as bigint[];
  const itemId = itemIds[0];
  const proofHash = keccak256(toBytes(`smoke-sanction-regression-${Date.now()}`));

  console.log(`\n--- Step 4: CHIOMA shipItemsGrouped(orderId=${orderId}, [itemId=${itemId}]) ---`);
  const shipHash = await wSeller.writeContract({
    address: ESCROW, abi: escrowAbi, functionName: "shipItemsGrouped",
    args: [orderId, [itemId], proofHash],
  });
  await pub.waitForTransactionReceipt({ hash: shipHash });
  console.log(`  [OK] ${fmtTx(shipHash)}`);

  // ───────────────────────────────────────────────────────────
  // Step 5: OWNER SANCTIONS THE SELLER (Suspended = 1)
  // ───────────────────────────────────────────────────────────
  console.log(`\n--- Step 5: Deployer applySanction(CHIOMA, Suspended) ---`);
  const sanctionHash = await wDeployer.writeContract({
    address: REPUTATION, abi: reputationAbi, functionName: "applySanction",
    args: [seller.address, 1],
  });
  await pub.waitForTransactionReceipt({ hash: sanctionHash });
  console.log(`  [OK] ${fmtTx(sanctionHash)}`);

  const repAfterSanction = (await pub.readContract({
    address: REPUTATION, abi: reputationAbi, functionName: "getReputation", args: [seller.address],
  })) as readonly [bigint, bigint, bigint, bigint, bigint, boolean, number, bigint, bigint];
  console.log(`  → CHIOMA.status = ${REP_STATUS[repAfterSanction[6]]} (raw ${repAfterSanction[6]})`);
  console.log(`  → CHIOMA.ordersCompleted = ${repAfterSanction[0]}`);

  // ───────────────────────────────────────────────────────────
  // Step 6: BUYER CONFIRMS DELIVERY — THIS IS THE REGRESSION CHECK
  //
  // Pre-fix: this revert with "Seller not active" via
  //   _releaseItemFully → reputation.recordCompletedOrder → require
  // Post-fix: succeeds, recordCompletedOrder no-ops silently for the
  //   sanctioned seller, buyer's funds flow normally.
  // ───────────────────────────────────────────────────────────
  console.log(`\n--- Step 6 (REGRESSION): AISSA confirmItemDelivery(${orderId}, ${itemId}) ---`);
  console.log(`  Pre-fix expectation: revert "Seller not active"`);
  console.log(`  Post-fix expectation: succeeds, item flips to Released, seller paid net`);

  const balSellerBefore = (await pub.readContract({
    address: MOCK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [seller.address],
  })) as bigint;
  const balTreasuryBefore = (await pub.readContract({
    address: MOCK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [TREASURY],
  })) as bigint;

  let confirmHash: `0x${string}` | null = null;
  let confirmError: Error | null = null;
  try {
    confirmHash = await wBuyer.writeContract({
      address: ESCROW, abi: escrowAbi, functionName: "confirmItemDelivery",
      args: [orderId, itemId],
    });
    await pub.waitForTransactionReceipt({ hash: confirmHash });
  } catch (e) {
    confirmError = e as Error;
  }

  if (confirmError) {
    console.log(`\n❌ REGRESSION FAILED — confirmItemDelivery reverted:`);
    console.log(`     ${confirmError.message.split("\n")[0]}`);
    console.log(`\n   This means the v1.3-audit-fixes ADR-054 fix for Pashov #1`);
    console.log(`   is NOT live on the deployed bytecode. Investigate immediately.`);
    process.exitCode = 1;
    return;
  }
  console.log(`  [OK] ${fmtTx(confirmHash!)}`);

  // Verify post-confirm state
  const itemAfter = (await pub.readContract({
    address: ESCROW, abi: escrowAbi, functionName: "getItem", args: [itemId],
  })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number];
  const balSellerAfter = (await pub.readContract({
    address: MOCK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [seller.address],
  })) as bigint;
  const balTreasuryAfter = (await pub.readContract({
    address: MOCK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [TREASURY],
  })) as bigint;

  const sellerDelta = balSellerAfter - balSellerBefore;
  const treasuryDelta = balTreasuryAfter - balTreasuryBefore;
  const expectedNet = ITEM_PRICE - (ITEM_PRICE * 18n) / 1000n; // 1.8% intra commission
  const expectedCommission = (ITEM_PRICE * 18n) / 1000n;

  console.log(`\n--- Verification ---`);
  console.log(`  Item status:        ${ITEM_STATUS[itemAfter[6]]} (raw ${itemAfter[6]}, expect Released=4)`);
  console.log(`  Seller delta:       ${formatUnits(sellerDelta, 6)} USDT  (expect ${formatUnits(expectedNet, 6)})`);
  console.log(`  Treasury delta:     ${formatUnits(treasuryDelta, 6)} USDT  (expect ${formatUnits(expectedCommission, 6)})`);

  // Verify reputation counters were NOT incremented (silent no-op)
  const repAfterConfirm = (await pub.readContract({
    address: REPUTATION, abi: reputationAbi, functionName: "getReputation", args: [seller.address],
  })) as readonly [bigint, bigint, bigint, bigint, bigint, boolean, number, bigint, bigint];
  console.log(`  CHIOMA.ordersCompleted (post-confirm): ${repAfterConfirm[0]}  (expect same as pre-confirm: ${repAfterSanction[0]})`);

  const allChecksPass =
    itemAfter[6] === 4 && // Released
    sellerDelta === expectedNet &&
    treasuryDelta === expectedCommission &&
    repAfterConfirm[0] === repAfterSanction[0]; // silent no-op on counter

  if (allChecksPass) {
    console.log(`\n✅ REGRESSION PASSED — Pashov #1 fix is live on v1.3-audit-fixes Sepolia deploy.`);
    console.log(`   Sanctioned-seller release no longer locks buyer funds.`);
    console.log(`   Reputation counters correctly frozen during sanction.`);
  } else {
    console.log(`\n⚠️  PARTIAL PASS — confirmItemDelivery succeeded but state mismatch:`);
    if (itemAfter[6] !== 4) console.log(`     - Item status ${ITEM_STATUS[itemAfter[6]]} ≠ Released`);
    if (sellerDelta !== expectedNet) console.log(`     - Seller delta ${formatUnits(sellerDelta, 6)} ≠ expected ${formatUnits(expectedNet, 6)}`);
    if (treasuryDelta !== expectedCommission) console.log(`     - Treasury delta ${formatUnits(treasuryDelta, 6)} ≠ expected ${formatUnits(expectedCommission, 6)}`);
    if (repAfterConfirm[0] !== repAfterSanction[0]) console.log(`     - ordersCompleted ${repAfterConfirm[0]} ≠ frozen ${repAfterSanction[0]}`);
    process.exitCode = 1;
  }

  // ───────────────────────────────────────────────────────────
  // Save artefact
  // ───────────────────────────────────────────────────────────
  const result = {
    scenario: "pashov-1-sanction-regression",
    tag: "v1.3-audit-fixes",
    adr: "ADR-054",
    startedAt,
    finishedAt: new Date().toISOString(),
    deploy: {
      reputation: REPUTATION, escrow: ESCROW, usdt: MOCK_USDT,
    },
    actors: {
      deployer: deployer.address,
      seller: seller.address,
      buyer: buyer.address,
    },
    orderId: orderId.toString(),
    itemId: itemId.toString(),
    txs: {
      approve: approveHash,
      create: createHash,
      fund: fundHash,
      ship: shipHash,
      sanction: sanctionHash,
      confirm: confirmHash,
    },
    deltas: {
      sellerNet: formatUnits(sellerDelta, 6),
      treasuryCommission: formatUnits(treasuryDelta, 6),
    },
    finalItemStatus: ITEM_STATUS[itemAfter[6]],
    reputationFrozen: repAfterConfirm[0] === repAfterSanction[0],
    passed: allChecksPass,
  };
  fs.writeFileSync(
    "scripts/smoke/sanction-regression-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(`\nResult written to scripts/smoke/sanction-regression-result.json`);
}

main().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exitCode = 1;
});
