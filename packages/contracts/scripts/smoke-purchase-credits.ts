/**
 * Smoke test: 1 purchase of 10 credits against the live EtaloCredits
 * contract on Celo Sepolia (Sprint J7 Block 5b).
 *
 * Reads addresses from deployments/celo-sepolia-v2.json. Validates the
 * end-to-end purchase path: approve USDT -> purchaseCredits(10) ->
 * treasury balance increases by 1.5 USDT, CreditsPurchased event emitted
 * with the correct args.
 *
 * Usage:
 *   npx hardhat run scripts/smoke-purchase-credits.ts --network celoSepolia
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";

const RPC_URL =
  process.env.CELO_SEPOLIA_RPC ?? "https://celo-sepolia.drpc.org";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: "CeloScan", url: "https://sepolia.celoscan.io" },
  },
  testnet: true,
});

function loadAbi(name: string) {
  const candidates = [
    path.join("artifacts", "contracts", `${name}.sol`, `${name}.json`),
    path.join("artifacts", "contracts", "test", `${name}.sol`, `${name}.json`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")).abi;
    }
  }
  throw new Error(`Artifact not found for ${name} in ${candidates.join(", ")}`);
}

const CREDITS_AMOUNT = 10n;
const USDT_PER_CREDIT = 150_000n;
const REQUIRED_USDT = CREDITS_AMOUNT * USDT_PER_CREDIT; // 1_500_000 = 1.5 USDT

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");

  const deployment = JSON.parse(
    fs.readFileSync(path.join("deployments", "celo-sepolia-v2.json"), "utf8"),
  );
  const credits = getAddress(deployment.contracts.EtaloCredits.address);
  const usdt = getAddress(deployment.contracts.MockUSDT.address);
  const treasury = getAddress(deployment.treasuries.credits);

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: celoSepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: celoSepolia,
    transport,
  });

  const creditsAbi = loadAbi("EtaloCredits");
  const usdtAbi = loadAbi("MockUSDT");

  console.log("=== EtaloCredits Sepolia smoke purchase ===");
  console.log(`Buyer:           ${account.address}`);
  console.log(`EtaloCredits:    ${credits}`);
  console.log(`MockUSDT:        ${usdt}`);
  console.log(`creditsTreasury: ${treasury}`);
  console.log(`Purchase:        ${CREDITS_AMOUNT} credits (${
    Number(REQUIRED_USDT) / 1e6
  } USDT)`);
  console.log("");

  // Buyer USDT balance pre
  const buyerBalanceBefore = (await publicClient.readContract({
    address: usdt,
    abi: usdtAbi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  if (buyerBalanceBefore < REQUIRED_USDT) {
    throw new Error(
      `Buyer USDT balance ${Number(buyerBalanceBefore) / 1e6} below required ${
        Number(REQUIRED_USDT) / 1e6
      } USDT. Mint via deploy.v2.ts or directly.`,
    );
  }

  const treasuryBalanceBefore = (await publicClient.readContract({
    address: usdt,
    abi: usdtAbi,
    functionName: "balanceOf",
    args: [treasury],
  })) as bigint;

  console.log(
    `Buyer USDT before:    ${Number(buyerBalanceBefore) / 1e6} USDT`,
  );
  console.log(
    `Treasury USDT before: ${Number(treasuryBalanceBefore) / 1e6} USDT`,
  );

  // ── Step 1: approve ──────────────────────────────────────────
  console.log("\nStep 1: approve EtaloCredits to spend USDT");
  const gasPrice = await publicClient.getGasPrice();
  const approveHash = await walletClient.writeContract({
    address: usdt,
    abi: usdtAbi,
    functionName: "approve",
    args: [credits, REQUIRED_USDT],
    type: "legacy" as any,
    gasPrice,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log(`  approve tx: ${approveHash}`);

  // ── Step 2: purchaseCredits ─────────────────────────────────
  console.log("\nStep 2: purchaseCredits(10)");
  const purchaseGasPrice = await publicClient.getGasPrice();
  const purchaseHash = await walletClient.writeContract({
    address: credits,
    abi: creditsAbi,
    functionName: "purchaseCredits",
    args: [CREDITS_AMOUNT],
    type: "legacy" as any,
    gasPrice: purchaseGasPrice,
  });
  console.log(`  purchase tx: ${purchaseHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: purchaseHash,
  });
  console.log(`  block: ${receipt.blockNumber}, status: ${receipt.status}`);
  if (receipt.status !== "success") {
    throw new Error("purchaseCredits reverted");
  }

  // ── Step 3: validate ────────────────────────────────────────
  console.log("\nStep 3: validate balances + event");
  const buyerBalanceAfter = (await publicClient.readContract({
    address: usdt,
    abi: usdtAbi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  const treasuryBalanceAfter = (await publicClient.readContract({
    address: usdt,
    abi: usdtAbi,
    functionName: "balanceOf",
    args: [treasury],
  })) as bigint;

  console.log(`  Buyer USDT after:    ${Number(buyerBalanceAfter) / 1e6} USDT`);
  console.log(
    `  Treasury USDT after: ${Number(treasuryBalanceAfter) / 1e6} USDT`,
  );

  const buyerDelta = buyerBalanceBefore - buyerBalanceAfter;
  const treasuryDelta = treasuryBalanceAfter - treasuryBalanceBefore;
  if (buyerDelta !== REQUIRED_USDT) {
    throw new Error(
      `Buyer delta ${buyerDelta} != expected ${REQUIRED_USDT}`,
    );
  }
  if (treasuryDelta !== REQUIRED_USDT) {
    throw new Error(
      `Treasury delta ${treasuryDelta} != expected ${REQUIRED_USDT}`,
    );
  }
  console.log(
    `  [OK] balance deltas match: -${
      Number(buyerDelta) / 1e6
    } USDT buyer, +${Number(treasuryDelta) / 1e6} USDT treasury`,
  );

  // CreditsPurchased event
  const eventLog = receipt.logs.find(
    (l) => getAddress(l.address) === credits,
  );
  if (!eventLog) throw new Error("No log from EtaloCredits in receipt");
  const decoded = decodeEventLog({
    abi: creditsAbi,
    data: eventLog.data,
    topics: eventLog.topics,
  });
  if (decoded.eventName !== "CreditsPurchased") {
    throw new Error(`Unexpected event: ${decoded.eventName}`);
  }
  const args = decoded.args as any;
  console.log(`  [OK] event: CreditsPurchased`);
  console.log(`       buyer:        ${args.buyer}`);
  console.log(`       creditAmount: ${args.creditAmount}`);
  console.log(`       usdtAmount:   ${args.usdtAmount}`);
  console.log(`       timestamp:    ${args.timestamp}`);

  console.log("\n=== Smoke test PASSED ===");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  console.error(e);
  process.exitCode = 1;
});
