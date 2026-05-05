import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Mint MockUSDT on Celo Sepolia to a recipient.
 *
 * Usage (from packages/contracts):
 *   npx hardhat run scripts/mint-test-usdt.ts --network celoSepolia
 *
 * Env (packages/contracts/.env):
 *   PRIVATE_KEY       = deployer PK (also becomes the tx sender)
 *   MINT_RECIPIENT    = address to credit  (defaults to deployer)
 *   MINT_AMOUNT_USDT  = human amount, e.g. "1000"  (defaults to 1000)
 */

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://celo-sepolia.drpc.org"] },
  },
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
  // Load V2 deployment manifest (post-Sprint J4 V2 contracts) by default.
  // Override via env var DEPLOYMENT_FILE=celo-sepolia.json for V1 era.
  const filename = process.env.DEPLOYMENT_FILE ?? "celo-sepolia-v2.json";
  const file = path.join("deployments", filename);
  return JSON.parse(fs.readFileSync(file, "utf8"));
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

  const deployment = loadDeployment();
  // V1 manifest : contracts.MockUSDT is a string. V2 manifest : object
  // with `.address` field. Support both shapes.
  const mock = deployment.contracts.MockUSDT;
  const usdt = (typeof mock === "string" ? mock : mock.address) as `0x${string}`;
  const usdtAbi = loadAbi("MockUSDT", true);

  const recipient = (process.env.MINT_RECIPIENT ?? account.address) as `0x${string}`;
  const amountHuman = process.env.MINT_AMOUNT_USDT ?? "1000";
  const amountRaw = parseUnits(amountHuman, 6); // USDT has 6 decimals

  console.log("=== Mint MockUSDT ===");
  console.log(`Sender:    ${account.address}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Amount:    ${amountHuman} USDT (${amountRaw} raw)`);
  console.log(`USDT addr: ${usdt}`);
  console.log();

  const balanceBefore = (await publicClient.readContract({
    address: usdt,
    abi: usdtAbi,
    functionName: "balanceOf",
    args: [recipient],
  })) as bigint;
  console.log(`Balance before: ${Number(balanceBefore) / 1e6} USDT`);

  // Legacy tx — Celo Sepolia rejects EIP-1559 params (see DECISIONS.md).
  const gasPrice = await publicClient.getGasPrice();
  const hash = await walletClient.writeContract({
    address: usdt,
    abi: usdtAbi,
    functionName: "mint",
    args: [recipient, amountRaw],
    type: "legacy" as const,
    gasPrice,
  });
  console.log(`\nTx hash: ${hash}`);
  console.log(`Explorer: https://celo-sepolia.blockscout.com/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Mined in block ${receipt.blockNumber}, status: ${receipt.status}`);

  const balanceAfter = (await publicClient.readContract({
    address: usdt,
    abi: usdtAbi,
    functionName: "balanceOf",
    args: [recipient],
  })) as bigint;
  console.log(`Balance after:  ${Number(balanceAfter) / 1e6} USDT`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
