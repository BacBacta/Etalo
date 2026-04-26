/**
 * Deploy EtaloCredits to Celo Sepolia (Sprint J7 Block 5b).
 *
 * Pattern: same legacy-tx viem path as scripts/deploy.v2.ts (Celo Sepolia
 * rejects EIP-1559). Reuses the existing celo-sepolia-v2.json deployment
 * artifact: reads MockUSDT + creditsTreasury from there, appends an
 * EtaloCredits entry without touching anything else.
 *
 * Required env (.env):
 *   PRIVATE_KEY              — deployer pk (no 0x prefix accepted, prefix added)
 *   CREDITS_TREASURY_ADDR    — checked against deployments/celo-sepolia-v2.json
 *                              .treasuries.credits
 *   CELO_SEPOLIA_RPC         — optional override (defaults to drpc.org)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-credits.ts --network celoSepolia
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  getAddress,
  http,
  isAddress,
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

function loadArtifact(contractName: string) {
  const filePath = path.join(
    "artifacts",
    "contracts",
    `${contractName}.sol`,
    `${contractName}.json`,
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Artifact not found at ${filePath}. Run: npx hardhat compile`,
    );
  }
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { abi: json.abi, bytecode: json.bytecode as `0x${string}` };
}

function requireEnvAddress(name: string): `0x${string}` {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing from .env`);
  if (!isAddress(v)) throw new Error(`${name} is not a valid address: ${v}`);
  return getAddress(v);
}

const DEPLOYMENT_PATH = path.join("deployments", "celo-sepolia-v2.json");

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");

  const CREDITS_TREASURY = requireEnvAddress("CREDITS_TREASURY_ADDR");

  // Read existing deployment artifact and extract MockUSDT.
  if (!fs.existsSync(DEPLOYMENT_PATH)) {
    throw new Error(
      `${DEPLOYMENT_PATH} not found — run scripts/deploy.v2.ts first.`,
    );
  }
  const existing = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
  const mockUsdtAddr = getAddress(existing.contracts.MockUSDT.address);
  const expectedTreasury = getAddress(existing.treasuries.credits);
  if (CREDITS_TREASURY !== expectedTreasury) {
    throw new Error(
      `CREDITS_TREASURY_ADDR (${CREDITS_TREASURY}) does not match ` +
        `deployment file treasuries.credits (${expectedTreasury}).`,
    );
  }
  if (existing.contracts.EtaloCredits) {
    throw new Error(
      `EtaloCredits already deployed at ${existing.contracts.EtaloCredits.address}. ` +
        `Remove it from ${DEPLOYMENT_PATH} to redeploy.`,
    );
  }

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: celoSepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: celoSepolia,
    transport,
  });

  console.log("=== EtaloCredits Sepolia Deploy (Sprint J7 Block 5b) ===");
  console.log(`Deployer:        ${account.address}`);
  const balance = await publicClient.getBalance({
    address: account.address,
  });
  console.log(`Balance:         ${Number(balance) / 1e18} CELO`);
  if (balance < 100_000_000_000_000_000n) {
    // 0.1 CELO floor
    console.warn(
      `WARNING: deployer balance ${Number(balance) / 1e18} CELO is below ` +
        `0.1 CELO. Deploy may fail.`,
    );
  }
  console.log(`Chain ID:        ${await publicClient.getChainId()}`);
  console.log(`MockUSDT:        ${mockUsdtAddr}`);
  console.log(`creditsTreasury: ${CREDITS_TREASURY}`);
  console.log(`Admin:           ${account.address}`);
  console.log("");

  // ============================================================
  // Deploy EtaloCredits
  // ============================================================
  const { abi, bytecode } = loadArtifact("EtaloCredits");
  const constructorArgs = [
    mockUsdtAddr,
    CREDITS_TREASURY,
    account.address,
  ] as const;
  const data = encodeDeployData({ abi, bytecode, args: constructorArgs });

  const gasPrice = await publicClient.getGasPrice();
  const gas = await publicClient.estimateGas({
    account: account.address,
    data,
  });
  console.log(`Deploying EtaloCredits — gas: ${gas}, gasPrice: ${gasPrice}`);

  const txHash = await walletClient.sendTransaction({
    data,
    type: "legacy" as any,
    gasPrice,
    gas: (gas * 120n) / 100n,
  });
  console.log(`tx: ${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });
  const address = getAddress(receipt.contractAddress!);
  console.log(`EtaloCredits:    ${address} (block ${receipt.blockNumber})`);

  // ============================================================
  // Sanity reads — confirm constructor wiring
  // ============================================================
  console.log("\n=== Sanity reads ===");
  const usdt = (await publicClient.readContract({
    address,
    abi,
    functionName: "usdt",
  })) as `0x${string}`;
  const treasury = (await publicClient.readContract({
    address,
    abi,
    functionName: "creditsTreasury",
  })) as `0x${string}`;
  const owner = (await publicClient.readContract({
    address,
    abi,
    functionName: "owner",
  })) as `0x${string}`;
  const usdtPerCredit = (await publicClient.readContract({
    address,
    abi,
    functionName: "USDT_PER_CREDIT",
  })) as bigint;

  const checks: Array<[string, string, string]> = [
    ["usdt", getAddress(usdt), mockUsdtAddr],
    ["creditsTreasury", getAddress(treasury), CREDITS_TREASURY],
    ["owner", getAddress(owner), account.address],
    ["USDT_PER_CREDIT", usdtPerCredit.toString(), "150000"],
  ];
  let mismatches = 0;
  for (const [label, actual, expected] of checks) {
    if (actual === expected) {
      console.log(`  [OK] ${label} = ${actual}`);
    } else {
      console.log(`  [MISMATCH] ${label}: expected ${expected}, got ${actual}`);
      mismatches++;
    }
  }
  if (mismatches > 0) throw new Error(`${mismatches} sanity check(s) failed`);

  // ============================================================
  // Persist to celo-sepolia-v2.json (preserve existing keys)
  // ============================================================
  existing.contracts.EtaloCredits = {
    address,
    txHash,
    block: receipt.blockNumber.toString(),
    constructorArgs: [mockUsdtAddr, CREDITS_TREASURY, account.address],
  };
  existing.creditsDeployedAt = new Date().toISOString();
  fs.writeFileSync(DEPLOYMENT_PATH, JSON.stringify(existing, null, 2));
  console.log(`\nUpdated ${DEPLOYMENT_PATH}`);

  console.log("\n=== Verify command ===");
  console.log(
    `npx hardhat verify --network celoSepolia ${address} ${mockUsdtAddr} ${CREDITS_TREASURY} ${account.address}`,
  );
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  console.error(e);
  process.exitCode = 1;
});
