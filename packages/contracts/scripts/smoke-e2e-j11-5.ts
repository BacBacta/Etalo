/**
 * smoke-e2e-j11-5.ts — Sprint J11.5 Block 8 orchestrator.
 *
 * Runs the full V1 buyer-facing tx sequence end-to-end on Celo
 * Sepolia, captures the resulting tx hashes, and writes a JSON
 * summary that mechanically fills `docs/audit/SAMPLE_TXS.md`. Used
 * to dogfood the new buyer interface MVP (Blocks 3-6) while
 * fulfilling the MiniPay listing prereq §3.
 *
 * Sections covered :
 *   §A Happy path intra (4 tx) — approve → create → fund → ship → confirm
 *   §B Cancellation pre-fund (1 tx) — create → cancel
 *   §C Dispute resolution N1 (4 tx + 2 setup tx) — create → fund → ship → openDispute → buyer resolveN1 → seller resolveN1
 *   §E Admin (1 tx) — registerLegalHold
 *   §F Credits (2 tx) — approve → purchaseCredits
 *
 * Sections deferred (per docs/audit/SAMPLE_TXS.md notes) :
 *   §D Permissionless triggers (time-bound 3d / 7d, can't simulate
 *      block-time advance on real Sepolia in a single session)
 *   §E emergencyPause / forceRefund (would lock Sepolia escrow for
 *      EMERGENCY_PAUSE_MAX = 7 days per ADR-026 ; forceRefund needs
 *      3 ADR-023 conditions impossible to set up live)
 *
 * Pre-conditions (verified by `preflightChecks()`) :
 *   - .env contains TEST_AISSA_PK (buyer), TEST_CHIOMA_PK (seller),
 *     PRIVATE_KEY (deployer / admin)
 *   - Buyer has ≥ 50 USDT on Sepolia + ≥ 0.05 CELO for gas
 *   - Seller has ≥ 0.05 CELO for gas
 *   - Deployer has ≥ 0.05 CELO for gas
 *   - Mainnet manifest in deployments/celo-sepolia-v2.json (post-H-1)
 *
 * Usage :
 *   pnpm hardhat run scripts/smoke-e2e-j11-5.ts --network celoSepolia
 *
 * Output :
 *   docs/audit/smoke-e2e-tx-output.json — structured summary
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { keccak256, parseAbi, toBytes } from "viem";

import {
  assertOrThrow,
  captureEventFromReceipt,
  fromUsdt,
  loadDeployments,
  loadTestWallets,
  makePublicClient,
  makeWalletClient,
  safeRpcUrl,
  sendTxWithEstimate,
  usdt,
  type TestWallets,
} from "./smoke/helpers.js";

// ============================================================
// Minimal ABI fragments
// ============================================================
const escrowAbi = parseAbi([
  "function createOrderWithItems(address seller, uint256[] itemPrices, bool isCrossBorder) returns (uint256)",
  "function fundOrder(uint256 orderId)",
  "function shipItemsGrouped(uint256 orderId, uint256[] itemIds, bytes32 proofHash) returns (uint256)",
  "function confirmItemDelivery(uint256 orderId, uint256 itemId)",
  "function cancelOrder(uint256 orderId)",
  "function registerLegalHold(uint256 orderId, bytes32 documentHash)",
  "function getOrderItems(uint256 orderId) view returns (uint256[])",
  "event OrderCreated(uint256 indexed orderId, address indexed buyer, address indexed seller, uint256 totalAmount, bool isCrossBorder, uint256 itemCount)",
]);

const disputeAbi = parseAbi([
  "function openDispute(uint256 orderId, uint256 itemId, string reason) returns (uint256)",
  "function resolveN1Amicable(uint256 disputeId, uint256 refundAmount)",
  // Match the on-chain event signature in IEtaloDispute.sol exactly —
  // 5 args (disputeId / orderId / itemId / buyer / reason). The earlier
  // 4-arg shape produced a different topic hash and decode missed the
  // log on Sepolia run 2026-05-06.
  "event DisputeOpened(uint256 indexed disputeId, uint256 indexed orderId, uint256 indexed itemId, address buyer, string reason)",
]);

const creditsAbi = parseAbi([
  "function purchaseCredits(uint256 creditAmount)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

// ============================================================
// Output structure
// ============================================================
interface TxRecord {
  hash: `0x${string}`;
  block?: bigint;
  smokeStep: string;
  contract: string;
  method: string;
  notes?: string;
}

const captures: Record<string, TxRecord> = {};

function capture(
  key: string,
  hash: `0x${string}`,
  block: bigint | undefined,
  smokeStep: string,
  contract: string,
  method: string,
  notes?: string,
): void {
  captures[key] = { hash, block, smokeStep, contract, method, notes };
}

// ============================================================
// Pre-flight
// ============================================================
async function preflightChecks(w: TestWallets): Promise<void> {
  const dep = loadDeployments();
  const pub = makePublicClient();

  console.log(`=== Pre-flight checks ===`);
  console.log(`Network : Celo Sepolia (chainId ${dep.chainId})`);
  console.log(`RPC     : ${safeRpcUrl()}`);
  console.log(`Buyer   : AISSA   ${w.aissa.address}`);
  console.log(`Seller  : CHIOMA  ${w.chioma.address}`);
  console.log(`Admin   : DEPLOY  ${w.deployer.address}`);
  console.log(`Escrow  : ${dep.addresses.escrow}`);
  console.log(`Dispute : ${dep.addresses.dispute}`);
  console.log(`USDT    : ${dep.addresses.usdt}\n`);

  const buyerUsdt = (await pub.readContract({
    address: dep.addresses.usdt,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [w.aissa.address],
  })) as bigint;
  console.log(`Buyer USDT balance : ${fromUsdt(buyerUsdt).toFixed(2)} USDT`);
  // Actual buyer outflow over the smoke run is ≈ 16 USDT (5 §A + 10 §C
  // funded concurrently + 1.5 §F purchase, refunds via cancel/dispute
  // resolve). Threshold 30 USDT gives ~14 USDT buffer for unexpected
  // gas-side surprises and tolerates re-runs after a partial flow.
  assertOrThrow(
    buyerUsdt >= usdt(30),
    "Buyer needs ≥ 30 USDT on Sepolia (mint via MockUSDT.mint or top up)",
    { actual: fromUsdt(buyerUsdt).toFixed(2), expected: "30.00" },
  );

  for (const [name, acc] of [
    ["AISSA", w.aissa],
    ["CHIOMA", w.chioma],
    ["DEPLOY", w.deployer],
  ] as const) {
    const celoBal = await pub.getBalance({ address: acc.address });
    console.log(`${name} CELO balance : ${(Number(celoBal) / 1e18).toFixed(4)} CELO`);
    assertOrThrow(
      celoBal >= 50_000_000_000_000_000n, // 0.05 CELO
      `${name} needs ≥ 0.05 CELO for gas`,
    );
  }
  console.log(`\nPre-flight passed.\n`);
}

// ============================================================
// §A Happy path intra (5 tx)
// ============================================================
async function runSectionA(w: TestWallets): Promise<void> {
  const dep = loadDeployments();
  const pub = makePublicClient();
  const wAissa = makeWalletClient(w.aissa);
  const wChioma = makeWalletClient(w.chioma);

  console.log(`\n=== §A Happy path intra ===`);
  const total = usdt(5);

  // A.0 approve (preliminary)
  const tA0 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.usdt, erc20Abi, "approve",
    [dep.addresses.escrow, total], "AISSA.approve(escrow, 5)",
  );
  capture("A0_approve", tA0.hash, tA0.receipt.blockNumber, "§A.0", "MockUSDT", "approve",
    "Buyer approves escrow to spend 5 USDT");

  // A.1 createOrderWithItems
  const tA1 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "createOrderWithItems",
    [w.chioma.address, [total], false], "AISSA.createOrderWithItems(CHIOMA, [5], intra)",
  );
  const orderArgs = captureEventFromReceipt<any>(tA1.receipt, "OrderCreated", escrowAbi);
  assertOrThrow(orderArgs !== null, "§A OrderCreated event missing");
  const orderId = orderArgs!.orderId as bigint;
  console.log(`  → orderId=${orderId}`);
  capture("A1_create", tA1.hash, tA1.receipt.blockNumber, "§A.1", "EtaloEscrow",
    "createOrderWithItems", `Buyer creates 1-item order with single seller (intra-Africa, 5 USDT) — orderId=${orderId}`);

  // A.2 fundOrder
  const tA2 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "fundOrder",
    [orderId], "AISSA.fundOrder",
  );
  capture("A2_fund", tA2.hash, tA2.receipt.blockNumber, "§A.2", "EtaloEscrow", "fundOrder",
    `Buyer transfers 5 USDT to escrow custody, status flips Funded — orderId=${orderId}`);

  // A.3 shipItemsGrouped (seller)
  const itemIds = (await pub.readContract({
    address: dep.addresses.escrow,
    abi: escrowAbi,
    functionName: "getOrderItems",
    args: [orderId],
  })) as bigint[];
  const proofHash = keccak256(toBytes(`smoke-j11-5-§A-${orderId}`));
  const tA3 = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.escrow, escrowAbi, "shipItemsGrouped",
    [orderId, itemIds, proofHash], "CHIOMA.shipItemsGrouped",
  );
  capture("A3_ship", tA3.hash, tA3.receipt.blockNumber, "§A.3", "EtaloEscrow", "shipItemsGrouped",
    `Seller marks items shipped (intra-Africa, no 20% release) — itemIds=[${itemIds.join(",")}]`);

  // A.4 confirmItemDelivery (buyer, per item)
  const tA4 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "confirmItemDelivery",
    [orderId, itemIds[0]], "AISSA.confirmItemDelivery",
  );
  capture("A4_confirm", tA4.hash, tA4.receipt.blockNumber, "§A.4", "EtaloEscrow",
    "confirmItemDelivery",
    `Buyer confirms item delivered, triggers commission split + seller payout + Reputation.recordCompletedOrder — itemId=${itemIds[0]}`);
}

// ============================================================
// §B Cancellation pre-fund (2 tx)
// ============================================================
async function runSectionB(w: TestWallets): Promise<void> {
  const dep = loadDeployments();
  const pub = makePublicClient();
  const wAissa = makeWalletClient(w.aissa);

  console.log(`\n=== §B Cancellation pre-fund ===`);
  const price = usdt(5);

  // B.0 createOrderWithItems (no funding)
  const tB0 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "createOrderWithItems",
    [w.chioma.address, [price], false], "AISSA.createOrderWithItems(intra, no fund)",
  );
  const orderArgs = captureEventFromReceipt<any>(tB0.receipt, "OrderCreated", escrowAbi);
  assertOrThrow(orderArgs !== null, "§B OrderCreated event missing");
  const orderId = orderArgs!.orderId as bigint;
  console.log(`  → orderId=${orderId} (will be cancelled)`);
  // No SAMPLE_TXS row for the create itself — covered by §A.1.

  // B.1 cancelOrder (status == Created)
  const tB1 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "cancelOrder",
    [orderId], "AISSA.cancelOrder",
  );
  capture("B1_cancel", tB1.hash, tB1.receipt.blockNumber, "§B.1", "EtaloEscrow", "cancelOrder",
    `Buyer cancels pre-fund order (status == Created) — orderId=${orderId}`);
}

// ============================================================
// §C Dispute resolution N1 (6 tx — 3 setup + 3 dispute)
// ============================================================
async function runSectionC(w: TestWallets): Promise<void> {
  const dep = loadDeployments();
  const pub = makePublicClient();
  const wAissa = makeWalletClient(w.aissa);
  const wChioma = makeWalletClient(w.chioma);

  console.log(`\n=== §C Dispute resolution N1 ===`);
  const total = usdt(10);

  // Setup : approve + create + fund + ship (no rows in SAMPLE_TXS — covered by §A)
  await sendTxWithEstimate(
    pub, wAissa, dep.addresses.usdt, erc20Abi, "approve",
    [dep.addresses.escrow, total], "AISSA.approve(escrow, 10) [§C setup]",
  );
  const tCreate = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "createOrderWithItems",
    [w.chioma.address, [total], false],
    "AISSA.createOrderWithItems [§C setup]",
  );
  const orderArgs = captureEventFromReceipt<any>(tCreate.receipt, "OrderCreated", escrowAbi);
  assertOrThrow(orderArgs !== null, "§C OrderCreated event missing");
  const orderId = orderArgs!.orderId as bigint;
  console.log(`  → orderId=${orderId} (will be disputed)`);

  await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "fundOrder",
    [orderId], "AISSA.fundOrder [§C setup]",
  );
  const itemIds = (await pub.readContract({
    address: dep.addresses.escrow, abi: escrowAbi,
    functionName: "getOrderItems", args: [orderId],
  })) as bigint[];
  const proofHash = keccak256(toBytes(`smoke-j11-5-§C-${orderId}`));
  await sendTxWithEstimate(
    pub, wChioma, dep.addresses.escrow, escrowAbi, "shipItemsGrouped",
    [orderId, itemIds, proofHash], "CHIOMA.shipItemsGrouped [§C setup]",
  );

  // C.1 openDispute (buyer, on Dispute contract)
  const tC1 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.dispute, disputeAbi, "openDispute",
    [orderId, itemIds[0], "Item not as described — smoke E2E §C"],
    "AISSA.openDispute",
  );
  const disputeArgs = captureEventFromReceipt<any>(tC1.receipt, "DisputeOpened", disputeAbi);
  assertOrThrow(disputeArgs !== null, "§C DisputeOpened event missing");
  const disputeId = disputeArgs!.disputeId as bigint;
  console.log(`  → disputeId=${disputeId}`);
  capture("C1_open_dispute", tC1.hash, tC1.receipt.blockNumber, "§C.2",
    "EtaloDispute", "openDispute",
    `Buyer opens dispute on funded shipped order — orderId=${orderId} disputeId=${disputeId}. H-1 fix gate require(order.fundedAt > 0) enforced.`);

  // C.2 resolveN1Amicable — buyer side (proposes refund)
  const refund = usdt(5); // half of 10 USDT
  const tC2 = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.dispute, disputeAbi, "resolveN1Amicable",
    [disputeId, refund], "AISSA.resolveN1Amicable(buyer side)",
  );
  capture("C2_resolve_buyer", tC2.hash, tC2.receipt.blockNumber, "§C.3a",
    "EtaloDispute", "resolveN1Amicable",
    `Buyer side of N1 amicable resolution, refundAmount=5 USDT — disputeId=${disputeId}`);

  // C.3 resolveN1Amicable — seller side (matches)
  const tC3 = await sendTxWithEstimate(
    pub, wChioma, dep.addresses.dispute, disputeAbi, "resolveN1Amicable",
    [disputeId, refund], "CHIOMA.resolveN1Amicable(seller side, matched)",
  );
  capture("C3_resolve_seller", tC3.hash, tC3.receipt.blockNumber, "§C.3b",
    "EtaloDispute", "resolveN1Amicable",
    `Seller side of N1 amicable matched — internal _applyResolution → escrow.resolveItemDispute. disputeId=${disputeId}`);
}

// ============================================================
// §E Admin — registerLegalHold only (1 tx)
//
// emergencyPause + forceRefund deferred — would lock Sepolia escrow
// for EMERGENCY_PAUSE_MAX = 7 days (ADR-026) ; forceRefund needs 3
// ADR-023 conditions impossible to set up in a single session.
// ============================================================
async function runSectionE(w: TestWallets): Promise<void> {
  const dep = loadDeployments();
  const pub = makePublicClient();
  const wDeployer = makeWalletClient(w.deployer);
  const wAissa = makeWalletClient(w.aissa);

  console.log(`\n=== §E Admin (registerLegalHold only) ===`);

  // Setup : create an order to hold (no fund needed — registerLegalHold
  // gates on order existence, not status).
  const tSetup = await sendTxWithEstimate(
    pub, wAissa, dep.addresses.escrow, escrowAbi, "createOrderWithItems",
    [w.chioma.address, [usdt(5)], false],
    "AISSA.createOrderWithItems [§E setup]",
  );
  const orderArgs = captureEventFromReceipt<any>(tSetup.receipt, "OrderCreated", escrowAbi);
  assertOrThrow(orderArgs !== null, "§E OrderCreated event missing");
  const orderId = orderArgs!.orderId as bigint;
  console.log(`  → orderId=${orderId} (legal-hold target)`);

  // E.2 registerLegalHold (admin / deployer)
  const docHash = keccak256(toBytes(`smoke-j11-5-§E-legal-${orderId}`));
  const tE2 = await sendTxWithEstimate(
    pub, wDeployer, dep.addresses.escrow, escrowAbi, "registerLegalHold",
    [orderId, docHash], "DEPLOYER.registerLegalHold",
  );
  capture("E2_legal_hold", tE2.hash, tE2.receipt.blockNumber, "§E.2",
    "EtaloEscrow", "registerLegalHold",
    `Owner registers legal hold reference (bytes32 docHash) on an order — orderId=${orderId}`);
}

// ============================================================
// §F Credits (2 tx)
// ============================================================
async function runSectionF(w: TestWallets): Promise<void> {
  const dep = loadDeployments();
  const pub = makePublicClient();
  const wAissa = makeWalletClient(w.aissa);

  console.log(`\n=== §F Credits ===`);

  // 0.15 USDT/credit × 10 credits = 1.5 USDT
  const creditAmount = 10n;
  const usdtCost = usdt(2); // ample, contract will charge actual

  // F.0 approve credits contract
  await sendTxWithEstimate(
    pub, wAissa, dep.addresses.usdt, erc20Abi, "approve",
    [dep.addresses.commissionTreasury, usdtCost],
    "AISSA.approve(creditsContract, 2) [§F setup]",
  );
  // The Credits contract address holds the abi but the spender is the
  // contract that pulls — we re-approve to the credits contract.
  // Note : the address is hardcoded in deployments under EtaloCredits.
  // Since `loadDeployments` doesn't expose `credits` yet, we read it
  // from the manifest directly.
  const file = path.join("deployments", "celo-sepolia-v2.json");
  const dep2 = JSON.parse(fs.readFileSync(file, "utf8"));
  const creditsAddr = dep2.contracts.EtaloCredits.address as `0x${string}`;
  console.log(`  → credits contract ${creditsAddr}`);
  await sendTxWithEstimate(
    pub, wAissa, dep.addresses.usdt, erc20Abi, "approve",
    [creditsAddr, usdtCost],
    "AISSA.approve(EtaloCredits, 2) [§F setup]",
  );

  // F.1 purchaseCredits
  const tF1 = await sendTxWithEstimate(
    pub, wAissa, creditsAddr, creditsAbi, "purchaseCredits",
    [creditAmount], "AISSA.purchaseCredits(10)",
  );
  capture("F1_purchase_credits", tF1.hash, tF1.receipt.blockNumber, "§F.1",
    "EtaloCredits", "purchaseCredits",
    `Buyer purchases 10 credits at 0.15 USDT/credit (1.5 USDT to creditsTreasury)`);
}

// ============================================================
// Main
// ============================================================
async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const w = loadTestWallets();

  await preflightChecks(w);
  await runSectionA(w);
  await runSectionB(w);
  await runSectionC(w);
  console.log(`\n=== §D Permissionless triggers ===`);
  console.log(`  [DEFER] Time-bound (3d / 7d). Post-mainnet natural surfacing per docs/audit/SAMPLE_TXS.md`);
  await runSectionE(w);
  await runSectionF(w);

  // ============================================================
  // Output
  // ============================================================
  const finishedAt = new Date().toISOString();
  const summary = {
    startedAt,
    finishedAt,
    network: "celoSepolia",
    chainId: 11142220,
    explorerBase: "https://celo-sepolia.blockscout.com",
    txs: Object.fromEntries(
      Object.entries(captures).map(([k, r]) => [
        k,
        {
          hash: r.hash,
          block: r.block?.toString() ?? null,
          smokeStep: r.smokeStep,
          contract: r.contract,
          method: r.method,
          notes: r.notes ?? null,
          explorerUrl: `https://celo-sepolia.blockscout.com/tx/${r.hash}`,
        },
      ]),
    ),
    deferred: {
      "§D.1 triggerAutoReleaseForItem": "Time-bound 3-day intra-Africa, no Sepolia evm_increaseTime",
      "§D.2 triggerAutoRefundIfInactive": "Time-bound 7-day intra-Africa, same constraint",
      "§E.1 emergencyPause": "Would lock Sepolia escrow for EMERGENCY_PAUSE_MAX (7 days, ADR-026)",
      "§E.3 forceRefund": "3 ADR-023 conditions (dispute inactive + 90+ days + legal hold) not reproducible in a single session",
    },
  };

  const outFile = path.join("..", "..", "docs", "audit", "smoke-e2e-tx-output.json");
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(`\n=== Smoke E2E summary ===`);
  console.log(`Captured ${Object.keys(captures).length} txs`);
  console.log(`Output written to : ${path.resolve(outFile)}\n`);
  for (const [key, rec] of Object.entries(captures)) {
    console.log(`${key.padEnd(20)} ${rec.method.padEnd(24)} ${rec.hash}`);
    console.log(`  ${summary.txs[key].explorerUrl}`);
  }
}

main().catch((err) => {
  console.error("\n[FATAL] Smoke E2E orchestrator failed :", err);
  // Save partial captures so the operator can still see what landed.
  const partial = {
    error: String(err),
    capturedSoFar: Object.fromEntries(
      Object.entries(captures).map(([k, r]) => [k, { hash: r.hash, smokeStep: r.smokeStep }]),
    ),
  };
  const outFile = path.join("..", "..", "docs", "audit", "smoke-e2e-tx-output-partial.json");
  try {
    fs.writeFileSync(outFile, JSON.stringify(partial, null, 2));
    console.error(`Partial capture written to ${outFile}`);
  } catch (writeErr) {
    console.error("Could not write partial capture :", writeErr);
  }
  process.exitCode = 1;
});
