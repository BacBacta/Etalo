/**
 * smoke/dispute-n3-force-close.ts — Combined live regression for
 * Pashov audit findings #2 (sellerWeeklyVolume release on refund)
 * and #5 (adminForceCloseN3IfNoQuorum escape hatch) on the
 * Celo Sepolia v1.3-audit-fixes deploy (ADR-054).
 *
 * Flow:
 *   1. Snapshot sellerWeeklyVolume[CHIOMA] before
 *   2. AISSA approves + creates + funds order (5 USDT)
 *      -> sellerWeeklyVolume += 5
 *   3. AISSA opens dispute on the item
 *   4. AISSA escalateToMediation (N1 -> N2) (buyer-only window)
 *   5. AISSA escalateToVoting (N2 -> N3) (buyer-only window)
 *      -> EtaloVoting.createVote fires, voteId tracked in
 *         EtaloDispute._disputeIdToVoteId
 *   6. NO votes are cast
 *   7. Deployer adminForceCloseN3IfNoQuorum
 *      -> Verifies (forBuyer, forSeller) == (0, 0)
 *      -> Calls _applyResolution(refund = remainingInEscrow)
 *      -> Calls escrow.resolveItemDispute(refund = full price)
 *      -> Pashov #2: sellerWeeklyVolume decremented by 5
 *   8. Verify dispute resolved, buyer refunded, weekly volume restored
 *
 * Pre-fix expectation (without ADR-054):
 *   - adminForceCloseN3IfNoQuorum doesn't exist -> dispute stuck at N3
 *     forever (finalizeVote would also revert "No quorum" pre-fix it
 *     was buyer-default-win, post-fix it requires quorum).
 *   - sellerWeeklyVolume never decremented even if dispute resolved.
 *
 * Post-fix expectation:
 *   - Owner can drain stuck N3 disputes
 *   - sellerWeeklyVolume returns to pre-fund value
 *
 * Usage:
 *   cd packages/contracts
 *   npx hardhat run scripts/smoke/dispute-n3-force-close.ts --network celoSepolia
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
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
  testnet: true,
});

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);

const escrowAbi = parseAbi([
  "function createOrderWithItems(address seller, uint256[] itemPrices, bool isCrossBorder) returns (uint256)",
  "function fundOrder(uint256 orderId)",
  "function sellerWeeklyVolume(address seller) view returns (uint256)",
  "function getOrderItems(uint256 orderId) view returns (uint256[])",
  "function getOrder(uint256 orderId) view returns (uint256 orderId_, address buyer, address seller, uint256 totalAmount, uint256 totalCommission, uint256 createdAt, uint256 fundedAt, bool isCrossBorder, uint8 globalStatus, uint256 itemCount, uint256 shipmentGroupCount)",
]);

const disputeAbi = parseAbi([
  "function openDispute(uint256 orderId, uint256 itemId, string reason) returns (uint256)",
  "function escalateToMediation(uint256 disputeId)",
  "function escalateToVoting(uint256 disputeId)",
  "function adminForceCloseN3IfNoQuorum(uint256 disputeId)",
  "function getDispute(uint256 disputeId) view returns (uint256 orderId, uint256 itemId, uint8 level, bool resolved)",
  "function approveMediator(address med, bool approved)",
  "function isMediatorApproved(address) view returns (bool)",
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

  const MOCK_USDT = dep.contracts.MockUSDT.address as `0x${string}`;
  const ESCROW = dep.contracts.EtaloEscrow.address as `0x${string}`;
  const DISPUTE = dep.contracts.EtaloDispute.address as `0x${string}`;

  const deployer = privateKeyToAccount(`0x${env.PRIVATE_KEY.replace(/^0x/, "")}`);
  const seller = privateKeyToAccount(`0x${env.TEST_CHIOMA_PK.replace(/^0x/, "")}`);
  const buyer = privateKeyToAccount(`0x${env.TEST_AISSA_PK.replace(/^0x/, "")}`);
  const mediator = privateKeyToAccount(`0x${env.TEST_MEDIATOR1_PK.replace(/^0x/, "")}`);

  const transport = http(RPC_URL);
  const pub = createPublicClient({ chain: celoSepolia, transport });
  const wDeployer = createWalletClient({ account: deployer, chain: celoSepolia, transport });
  const wSeller = createWalletClient({ account: seller, chain: celoSepolia, transport });
  const wBuyer = createWalletClient({ account: buyer, chain: celoSepolia, transport });

  console.log("=== Pashov #2 + #5 regression — N3 admin force close + weekly volume release ===");
  console.log(`Deployer:   ${deployer.address}`);
  console.log(`Seller:     CHIOMA  ${seller.address}`);
  console.log(`Buyer:      AISSA   ${buyer.address}`);
  console.log(`Escrow:     ${ESCROW}`);
  console.log(`Dispute:    ${DISPUTE}\n`);

  const ITEM_PRICE = parseUnits("5", 6);

  // ───────────────────────────────────────────────────────────
  // Step 0: Ensure AISSA has USDT
  // ───────────────────────────────────────────────────────────
  console.log("--- Step 0: Top-up AISSA USDT ---");
  const aissaBal = (await pub.readContract({
    address: MOCK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address],
  })) as bigint;
  if (aissaBal < ITEM_PRICE) {
    const hash = await wDeployer.writeContract({
      address: MOCK_USDT, abi: erc20Abi, functionName: "mint",
      args: [buyer.address, parseUnits("20", 6)],
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  [OK] mint(AISSA, 20 USDT)  ${fmtTx(hash)}`);
  } else {
    console.log(`  [SKIP] AISSA has ${formatUnits(aissaBal, 6)} USDT`);
  }

  // ───────────────────────────────────────────────────────────
  // Step 0.5: Ensure at least 1 mediator approved (escalateToVoting needs ≥1 eligible voter).
  // The voter list excludes the N2 mediator if assigned, so 1 is enough
  // when no N2 is assigned (we don't assign one in this flow).
  // ───────────────────────────────────────────────────────────
  const mediatorApproved = (await pub.readContract({
    address: DISPUTE, abi: disputeAbi, functionName: "isMediatorApproved", args: [mediator.address],
  })) as boolean;
  if (!mediatorApproved) {
    console.log(`\n--- Step 0.5: Deployer approveMediator(MEDIATOR1) ---`);
    const hash = await wDeployer.writeContract({
      address: DISPUTE, abi: disputeAbi, functionName: "approveMediator",
      args: [mediator.address, true],
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  [OK] MEDIATOR1 approved  ${fmtTx(hash)}`);
  } else {
    console.log(`\n--- Step 0.5: MEDIATOR1 already approved [SKIP] ---`);
  }

  // ───────────────────────────────────────────────────────────
  // Step 1: Snapshot sellerWeeklyVolume[CHIOMA]
  // ───────────────────────────────────────────────────────────
  const weeklyBefore = (await pub.readContract({
    address: ESCROW, abi: escrowAbi, functionName: "sellerWeeklyVolume", args: [seller.address],
  })) as bigint;
  console.log(`\n--- Step 1: sellerWeeklyVolume[CHIOMA] BEFORE = ${formatUnits(weeklyBefore, 6)} USDT ---`);

  // ───────────────────────────────────────────────────────────
  // Step 2: AISSA approves + creates + funds
  // ───────────────────────────────────────────────────────────
  console.log("\n--- Step 2: AISSA approve + create + fund (5 USDT) ---");
  const approveHash = await wBuyer.writeContract({
    address: MOCK_USDT, abi: erc20Abi, functionName: "approve", args: [ESCROW, ITEM_PRICE],
  });
  await pub.waitForTransactionReceipt({ hash: approveHash });

  const createHash = await wBuyer.writeContract({
    address: ESCROW, abi: escrowAbi, functionName: "createOrderWithItems",
    args: [seller.address, [ITEM_PRICE], false],
  });
  const createReceipt = await pub.waitForTransactionReceipt({ hash: createHash });
  const orderCreatedTopic = keccak256(toBytes("OrderCreated(uint256,address,address,uint256,bool,uint256)"));
  const log = createReceipt.logs.find((l) => l.topics[0] === orderCreatedTopic && l.address.toLowerCase() === ESCROW.toLowerCase());
  if (!log) throw new Error("OrderCreated event not found");
  const orderId = BigInt(log.topics[1]!);

  const fundHash = await wBuyer.writeContract({
    address: ESCROW, abi: escrowAbi, functionName: "fundOrder", args: [orderId],
  });
  await pub.waitForTransactionReceipt({ hash: fundHash });
  console.log(`  [OK] orderId=${orderId}, fund tx ${fmtTx(fundHash)}`);

  const weeklyAfterFund = (await pub.readContract({
    address: ESCROW, abi: escrowAbi, functionName: "sellerWeeklyVolume", args: [seller.address],
  })) as bigint;
  console.log(`  sellerWeeklyVolume after fund = ${formatUnits(weeklyAfterFund, 6)} USDT  (expect +5)`);

  // ───────────────────────────────────────────────────────────
  // Step 3-5: Open dispute + escalate to N3
  // ───────────────────────────────────────────────────────────
  const itemIds = (await pub.readContract({
    address: ESCROW, abi: escrowAbi, functionName: "getOrderItems", args: [orderId],
  })) as bigint[];
  const itemId = itemIds[0];

  console.log(`\n--- Step 3: AISSA openDispute(orderId=${orderId}, itemId=${itemId}) ---`);
  const openHash = await wBuyer.writeContract({
    address: DISPUTE, abi: disputeAbi, functionName: "openDispute",
    args: [orderId, itemId, "smoke-regression-pashov-2-5"],
  });
  const openReceipt = await pub.waitForTransactionReceipt({ hash: openHash });
  const disputeOpenedTopic = keccak256(toBytes("DisputeOpened(uint256,uint256,uint256,address,string)"));
  const disputeLog = openReceipt.logs.find((l) => l.topics[0] === disputeOpenedTopic && l.address.toLowerCase() === DISPUTE.toLowerCase());
  if (!disputeLog) throw new Error("DisputeOpened event not found");
  const disputeId = BigInt(disputeLog.topics[1]!);
  console.log(`  [OK] disputeId=${disputeId}  ${fmtTx(openHash)}`);

  console.log(`\n--- Step 4: AISSA escalateToMediation (N1 -> N2) ---`);
  const escN2Hash = await wBuyer.writeContract({
    address: DISPUTE, abi: disputeAbi, functionName: "escalateToMediation", args: [disputeId],
  });
  await pub.waitForTransactionReceipt({ hash: escN2Hash });
  console.log(`  [OK] ${fmtTx(escN2Hash)}`);

  console.log(`\n--- Step 5: AISSA escalateToVoting (N2 -> N3) ---`);
  const escN3Hash = await wBuyer.writeContract({
    address: DISPUTE, abi: disputeAbi, functionName: "escalateToVoting", args: [disputeId],
  });
  await pub.waitForTransactionReceipt({ hash: escN3Hash });
  console.log(`  [OK] ${fmtTx(escN3Hash)}`);

  const [, , levelAfterN3] = (await pub.readContract({
    address: DISPUTE, abi: disputeAbi, functionName: "getDispute", args: [disputeId],
  })) as [bigint, bigint, number, boolean];
  console.log(`  Dispute level = ${levelAfterN3}  (expect 3 = N3)`);

  // ───────────────────────────────────────────────────────────
  // Step 6: NO votes cast — owner triggers escape hatch
  // ───────────────────────────────────────────────────────────
  const buyerBalBefore = (await pub.readContract({
    address: MOCK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address],
  })) as bigint;

  console.log(`\n--- Step 6: Deployer adminForceCloseN3IfNoQuorum(${disputeId}) ---`);
  console.log(`  Pre-fix: function did not exist; dispute stuck at N3 forever`);
  console.log(`  Post-fix: owner force-closes since (forBuyer, forSeller) == (0, 0)`);

  let closeHash: `0x${string}` | null = null;
  let closeError: Error | null = null;
  try {
    closeHash = await wDeployer.writeContract({
      address: DISPUTE, abi: disputeAbi, functionName: "adminForceCloseN3IfNoQuorum",
      args: [disputeId],
    });
    await pub.waitForTransactionReceipt({ hash: closeHash });
  } catch (e) {
    closeError = e as Error;
  }

  if (closeError) {
    console.log(`\n❌ REGRESSION FAILED — adminForceCloseN3IfNoQuorum reverted:`);
    console.log(`     ${closeError.message.split("\n")[0]}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  [OK] ${fmtTx(closeHash!)}`);

  // ───────────────────────────────────────────────────────────
  // Step 7: Verify
  // ───────────────────────────────────────────────────────────
  const [, , levelAfter, resolvedAfter] = (await pub.readContract({
    address: DISPUTE, abi: disputeAbi, functionName: "getDispute", args: [disputeId],
  })) as [bigint, bigint, number, boolean];

  const buyerBalAfter = (await pub.readContract({
    address: MOCK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address],
  })) as bigint;
  const buyerDelta = buyerBalAfter - buyerBalBefore;

  const weeklyAfter = (await pub.readContract({
    address: ESCROW, abi: escrowAbi, functionName: "sellerWeeklyVolume", args: [seller.address],
  })) as bigint;

  console.log(`\n--- Verification ---`);
  console.log(`  Dispute level: ${levelAfter}  (expect 4 = RESOLVED)`);
  console.log(`  Dispute resolved: ${resolvedAfter}  (expect true)`);
  console.log(`  Buyer USDT delta: +${formatUnits(buyerDelta, 6)} USDT  (expect +5 full refund)`);
  console.log(`  sellerWeeklyVolume AFTER  = ${formatUnits(weeklyAfter, 6)} USDT  (expect ${formatUnits(weeklyBefore, 6)})`);

  const pashov5Pass = resolvedAfter && levelAfter === 4 && buyerDelta === ITEM_PRICE;
  const pashov2Pass = weeklyAfter === weeklyBefore;

  if (pashov5Pass) console.log(`\n✅ Pashov #5 REGRESSION PASSED — N3 escape hatch + zero-quorum guard live.`);
  else console.log(`\n❌ Pashov #5 — partial fail.`);

  if (pashov2Pass) console.log(`✅ Pashov #2 REGRESSION PASSED — sellerWeeklyVolume released on refund.`);
  else console.log(`❌ Pashov #2 — weekly volume not decremented as expected.`);

  const result = {
    scenario: "pashov-2-5-regression",
    tag: "v1.3-audit-fixes",
    adr: "ADR-054",
    startedAt,
    finishedAt: new Date().toISOString(),
    deploy: { escrow: ESCROW, dispute: DISPUTE, usdt: MOCK_USDT },
    actors: { deployer: deployer.address, seller: seller.address, buyer: buyer.address },
    orderId: orderId.toString(),
    disputeId: disputeId.toString(),
    itemId: itemId.toString(),
    txs: {
      approve: approveHash, create: createHash, fund: fundHash,
      open: openHash, escN2: escN2Hash, escN3: escN3Hash,
      adminClose: closeHash,
    },
    pashov2: {
      weeklyBefore: formatUnits(weeklyBefore, 6),
      weeklyAfterFund: formatUnits(weeklyAfterFund, 6),
      weeklyAfterResolve: formatUnits(weeklyAfter, 6),
      passed: pashov2Pass,
    },
    pashov5: {
      finalLevel: levelAfter,
      resolved: resolvedAfter,
      buyerRefund: formatUnits(buyerDelta, 6),
      passed: pashov5Pass,
    },
  };
  fs.writeFileSync("scripts/smoke/dispute-n3-force-close-result.json", JSON.stringify(result, null, 2));
  console.log(`\nResult written to scripts/smoke/dispute-n3-force-close-result.json`);

  if (!pashov2Pass || !pashov5Pass) process.exitCode = 1;
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exitCode = 1; });
