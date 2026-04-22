import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * End-to-end checkout smoke on Celo Sepolia.
 *
 * Runs the exact 3-tx sequence the Mini App will run at Block 7:
 *   1. USDT.approve(escrow, amount)  [skipped if allowance >= amount]
 *   2. EtaloEscrow.createOrder(seller, amount, isCrossBorder)
 *   3. EtaloEscrow.fundOrder(orderId)
 * and asserts the resulting Order.status == Funded.
 *
 * This script isolates the on-chain flow so any UI bug at Block 7 can
 * be ruled out by running this first.
 *
 * Env (packages/contracts/.env):
 *   PRIVATE_KEY            = buyer PK (must hold CELO + USDT)
 *   E2E_SELLER_ADDRESS     = any non-zero address != buyer
 *                            (defaults to 0x...dEaD for testing)
 *   E2E_AMOUNT_USDT        = human amount, defaults to "5"
 *   E2E_IS_CROSS_BORDER    = "true" | "false", defaults to "false"
 */

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://celo-sepolia.drpc.org"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://celo-sepolia.blockscout.com" },
  },
  testnet: true,
});

function loadAbi(contractName: string, inTest = false) {
  const sub = inTest ? "test/" : "";
  const file = path.join(
    "artifacts",
    "contracts",
    `${sub}${contractName}.sol`,
    `${contractName}.json`,
  );
  return JSON.parse(fs.readFileSync(file, "utf8")).abi;
}

function loadDeployment() {
  return JSON.parse(
    fs.readFileSync(path.join("deployments", "celo-sepolia.json"), "utf8"),
  );
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");
  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);

  const transport = http("https://celo-sepolia.drpc.org");
  const publicClient = createPublicClient({ chain: celoSepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: celoSepolia,
    transport,
  });

  const dep = loadDeployment();
  const ESCROW = dep.contracts.EtaloEscrow as `0x${string}`;
  const USDT = dep.contracts.MockUSDT as `0x${string}`;
  const escrowAbi = loadAbi("EtaloEscrow");
  const usdtAbi = loadAbi("MockUSDT", true);

  const seller = (process.env.E2E_SELLER_ADDRESS ??
    "0x000000000000000000000000000000000000dEaD") as `0x${string}`;
  const amountRaw = parseUnits(process.env.E2E_AMOUNT_USDT ?? "5", 6);
  const isCrossBorder =
    (process.env.E2E_IS_CROSS_BORDER ?? "false").toLowerCase() === "true";

  console.log("=== Etalo E2E Checkout (on-chain) ===");
  console.log(`Buyer:   ${account.address}`);
  console.log(`Seller:  ${seller}`);
  console.log(`Escrow:  ${ESCROW}`);
  console.log(`USDT:    ${USDT}`);
  console.log(`Amount:  ${amountRaw} raw (${Number(amountRaw) / 1e6} USDT)`);
  console.log(`Cross-border: ${isCrossBorder}`);
  console.log();

  if (seller.toLowerCase() === account.address.toLowerCase()) {
    throw new Error("Seller cannot equal buyer (contract revert)");
  }

  const gasPrice = await publicClient.getGasPrice();

  // --- Balance + allowance pre-check -----------------------------------
  const [balance, allowance] = await Promise.all([
    publicClient.readContract({
      address: USDT,
      abi: usdtAbi,
      functionName: "balanceOf",
      args: [account.address],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: USDT,
      abi: usdtAbi,
      functionName: "allowance",
      args: [account.address, ESCROW],
    }) as Promise<bigint>,
  ]);
  console.log(`USDT balance:   ${Number(balance) / 1e6}`);
  console.log(`Allowance:      ${Number(allowance) / 1e6}`);

  if (balance < amountRaw) {
    throw new Error(
      `Insufficient USDT. Run mint-test-usdt.ts first. (need ${amountRaw}, have ${balance})`,
    );
  }

  // --- 1) approve -------------------------------------------------------
  if (allowance < amountRaw) {
    console.log(`\n[1/3] approve(escrow, ${amountRaw})`);
    const hash = await walletClient.writeContract({
      address: USDT,
      abi: usdtAbi,
      functionName: "approve",
      args: [ESCROW, amountRaw],
      type: "legacy" as const,
      gasPrice,
    });
    console.log(`      tx: ${hash}`);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`      mined block ${r.blockNumber}, status: ${r.status}`);
  } else {
    console.log(`\n[1/3] skipping approve (allowance already sufficient)`);
  }

  // --- 2) createOrder ---------------------------------------------------
  console.log(`\n[2/3] createOrder(${seller}, ${amountRaw}, ${isCrossBorder})`);
  const createHash = await walletClient.writeContract({
    address: ESCROW,
    abi: escrowAbi,
    functionName: "createOrder",
    args: [seller, amountRaw, isCrossBorder],
    type: "legacy" as const,
    gasPrice,
  });
  console.log(`      tx: ${createHash}`);
  const createReceipt = await publicClient.waitForTransactionReceipt({
    hash: createHash,
  });
  console.log(
    `      mined block ${createReceipt.blockNumber}, status: ${createReceipt.status}`,
  );

  // Decode OrderCreated event to capture orderId.
  let orderId: bigint | null = null;
  for (const log of createReceipt.logs) {
    if (log.address.toLowerCase() !== ESCROW.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: escrowAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "OrderCreated") {
        orderId = (decoded.args as unknown as { orderId: bigint }).orderId;
        break;
      }
    } catch {
      // non-matching log, ignore
    }
  }
  if (orderId === null) throw new Error("OrderCreated event not found");
  console.log(`      orderId = ${orderId}`);

  // --- 3) fundOrder -----------------------------------------------------
  console.log(`\n[3/3] fundOrder(${orderId})`);
  const fundHash = await walletClient.writeContract({
    address: ESCROW,
    abi: escrowAbi,
    functionName: "fundOrder",
    args: [orderId],
    type: "legacy" as const,
    gasPrice,
  });
  console.log(`      tx: ${fundHash}`);
  const fundReceipt = await publicClient.waitForTransactionReceipt({
    hash: fundHash,
  });
  console.log(
    `      mined block ${fundReceipt.blockNumber}, status: ${fundReceipt.status}`,
  );

  // --- Verify on-chain state -------------------------------------------
  const order = (await publicClient.readContract({
    address: ESCROW,
    abi: escrowAbi,
    functionName: "getOrder",
    args: [orderId],
  })) as {
    orderId: bigint;
    buyer: `0x${string}`;
    seller: `0x${string}`;
    amount: bigint;
    commission: bigint;
    status: number;
    isCrossBorder: boolean;
  };

  const STATUS = [
    "Created",
    "Funded",
    "Shipped",
    "Delivered",
    "Completed",
    "Disputed",
    "Refunded",
    "Cancelled",
  ];
  console.log("\n=== Order on-chain state ===");
  console.log(`orderId:    ${order.orderId}`);
  console.log(`buyer:      ${order.buyer}`);
  console.log(`seller:     ${order.seller}`);
  console.log(`amount:     ${order.amount} (${Number(order.amount) / 1e6} USDT)`);
  console.log(
    `commission: ${order.commission} (${Number(order.commission) / 1e6} USDT)`,
  );
  console.log(`status:     ${order.status} (${STATUS[Number(order.status)]})`);
  console.log(`isCrossBorder: ${order.isCrossBorder}`);

  if (STATUS[Number(order.status)] !== "Funded") {
    throw new Error(
      `Expected status Funded, got ${STATUS[Number(order.status)]}`,
    );
  }
  console.log(`\n✓ Flow complete. Order ${orderId} is Funded.`);
  console.log(
    `  Create tx: https://celo-sepolia.blockscout.com/tx/${createHash}`,
  );
  console.log(`  Fund   tx: https://celo-sepolia.blockscout.com/tx/${fundHash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
