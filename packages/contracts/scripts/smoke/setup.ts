/**
 * smoke/setup.ts — Phase A setup for Block 12 testnet smoke tests.
 *
 * Idempotent: re-running is safe. For each test wallet, if
 * TEST_<NAME>_PK already exists in .env the existing key is reused;
 * otherwise a new key is generated and appended to .env. Funding
 * (CELO / USDT) and approveMediator are skipped when already
 * satisfied on-chain.
 *
 * Usage:
 *   npx hardhat run scripts/smoke/setup.ts --network celoSepolia
 *
 * .env writes ONLY the private keys. Addresses are printed to stdout
 * (public info). The .env must be gitignored (checked at repo root).
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  parseEther,
  parseUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = process.env.CELO_SEPOLIA_RPC ?? "https://celo-sepolia.drpc.org";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
});

const ENV_PATH = ".env";
const DEPLOYMENT_PATH = path.join("deployments", "celo-sepolia-v2.json");
const WALLET_NAMES = ["CHIOMA", "AISSA", "MAMADOU", "MEDIATOR1"] as const;

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);
const disputeAbi = parseAbi([
  "function approveMediator(address med, bool approved) external",
  "function isMediatorApproved(address) view returns (bool)",
]);

function parseEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, "utf8");
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

async function main() {
  if (!fs.existsSync(DEPLOYMENT_PATH)) {
    throw new Error(`Missing ${DEPLOYMENT_PATH}`);
  }
  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
  const MOCK_USDT = deployment.contracts.MockUSDT.address as `0x${string}`;
  const DISPUTE = deployment.contracts.EtaloDispute.address as `0x${string}`;

  const env = parseEnv();
  const deployerPk = env.PRIVATE_KEY;
  if (!deployerPk) throw new Error("PRIVATE_KEY missing from .env");

  const deployer = privateKeyToAccount(`0x${deployerPk.replace(/^0x/, "")}`);
  const transport = http(RPC_URL);
  // Redact any API key in the URL to avoid leaking secrets into logs
  const safeRpcUrl = RPC_URL.replace(/\/v2\/[^/?]+/, "/v2/<redacted>");
  console.log(`RPC:        ${safeRpcUrl}`);
  const publicClient = createPublicClient({ chain: celoSepolia, transport });
  const walletClient = createWalletClient({ account: deployer, chain: celoSepolia, transport });

  console.log("=== Phase A — Smoke Test Wallet Setup ===");
  console.log(`Deployer:   ${deployer.address}`);
  console.log(`MockUSDT:   ${MOCK_USDT}`);
  console.log(`Dispute:    ${DISPUTE}\n`);

  // --- 1. Ensure 4 test wallets (generate + append PK to .env if missing)
  const wallets: Record<string, { address: `0x${string}`; created: boolean }> = {};
  const newKeyLines: string[] = [];

  for (const name of WALLET_NAMES) {
    const envKey = `TEST_${name}_PK`;
    let pk = env[envKey];
    let created = false;
    if (!pk) {
      pk = generatePrivateKey().replace(/^0x/, "");
      newKeyLines.push(`${envKey}=${pk}`);
      env[envKey] = pk;
      created = true;
    }
    const account = privateKeyToAccount(`0x${pk}` as `0x${string}`);
    wallets[name] = { address: account.address, created };
  }

  if (newKeyLines.length) {
    const header = `\n# --- Block 12 smoke-test wallets (generated ${new Date().toISOString()}) ---\n`;
    fs.appendFileSync(ENV_PATH, header + newKeyLines.join("\n") + "\n");
    console.log(`Appended ${newKeyLines.length} new test key(s) to .env\n`);
  } else {
    console.log(`All 4 test wallet keys already in .env — reusing.\n`);
  }

  for (const name of WALLET_NAMES) {
    const w = wallets[name];
    console.log(`  ${name.padEnd(10)} ${w.address}  ${w.created ? "(new)" : "(existing)"}`);
  }

  // --- Tx helpers
  // Hardcoded gas to bypass drpc's flaky eth_estimateGas (2026-04-24 incident)
  const GAS_CELO_TRANSFER = 21_000n;
  const GAS_CONTRACT_CALL = 150_000n;

  async function sendCelo(label: string, to: `0x${string}`, value: bigint) {
    const gasPrice = await publicClient.getGasPrice();
    const hash = await walletClient.sendTransaction({
      to, value, type: "legacy" as any, gasPrice, gas: GAS_CELO_TRANSFER,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted (${hash})`);
    console.log(`  [OK] ${label}  tx=${hash}`);
    return hash;
  }
  async function writeTx(label: string, address: `0x${string}`, abi: any, fn: string, args: unknown[]) {
    const gasPrice = await publicClient.getGasPrice();
    const hash = await walletClient.writeContract({
      address, abi, functionName: fn, args, type: "legacy" as any, gasPrice, gas: GAS_CONTRACT_CALL,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted (${hash})`);
    console.log(`  [OK] ${label}  tx=${hash}`);
    return hash;
  }

  // --- 2. Fund CELO per-wallet (top-up to target — differential transfer)
  // Targets sized for scenario needs: MAMADOU does 4 scenarios (~0.5 CELO),
  // CHIOMA does 5 (~0.4), AISSA 1 (~0.1), MEDIATOR1 1 tx (~0.05).
  const CELO_TARGETS: Record<string, bigint> = {
    CHIOMA: parseEther("0.4"),
    AISSA: parseEther("0.15"),
    MAMADOU: parseEther("0.6"),
    MEDIATOR1: parseEther("0.05"),
  };
  console.log("\n--- CELO funding (top-up to per-wallet target) ---");
  const celoTxs: Record<string, string | null> = {};
  for (const name of WALLET_NAMES) {
    const addr = wallets[name].address;
    const target = CELO_TARGETS[name];
    const bal = await publicClient.getBalance({ address: addr });
    if (bal >= target) {
      console.log(`  [SKIP] ${name}  ${(Number(bal) / 1e18).toFixed(4)} CELO already >= target ${(Number(target) / 1e18).toFixed(2)}`);
      celoTxs[name] = null;
      continue;
    }
    const diff = target - bal;
    celoTxs[name] = await sendCelo(
      `CELO→${name} (+${(Number(diff) / 1e18).toFixed(4)}, target ${(Number(target) / 1e18).toFixed(2)})`,
      addr, diff,
    );
  }

  // --- 3. Fund USDT (200 to buyers, 50 to chioma) — idempotent
  console.log("\n--- USDT funding (idempotent) ---");
  const USDT_TARGETS: Record<string, bigint> = {
    CHIOMA: parseUnits("50", 6),
    AISSA: parseUnits("200", 6),
    MAMADOU: parseUnits("200", 6),
  };
  const usdtTxs: Record<string, string | null> = {};
  for (const [name, target] of Object.entries(USDT_TARGETS)) {
    const addr = wallets[name].address;
    const bal = (await publicClient.readContract({
      address: MOCK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [addr],
    })) as bigint;
    if (bal >= target) {
      console.log(`  [SKIP] ${name}  ${(Number(bal) / 1e6).toFixed(2)} USDT already funded`);
      usdtTxs[name] = null;
      continue;
    }
    const diff = target - bal;
    usdtTxs[name] = await writeTx(
      `USDT→${name} (+${(Number(diff) / 1e6).toFixed(2)})`,
      MOCK_USDT, erc20Abi, "transfer", [addr, diff],
    );
  }

  // --- 4. Approve mediator1 (idempotent)
  console.log("\n--- Mediator approval ---");
  const mediatorAddr = wallets.MEDIATOR1.address;
  const isMed = (await publicClient.readContract({
    address: DISPUTE, abi: disputeAbi, functionName: "isMediatorApproved", args: [mediatorAddr],
  })) as boolean;
  let mediatorTx: string | null = null;
  if (isMed) {
    console.log(`  [SKIP] MEDIATOR1 already approved on Dispute contract`);
  } else {
    mediatorTx = await writeTx(
      "approveMediator(MEDIATOR1, true)",
      DISPUTE, disputeAbi, "approveMediator", [mediatorAddr, true],
    );
  }

  // --- 5. Final balance snapshot
  console.log("\n=== Final balances ===");
  const allAddrs: { name: string; addr: `0x${string}` }[] = [
    { name: "DEPLOYER", addr: deployer.address },
    ...WALLET_NAMES.map((n) => ({ name: n, addr: wallets[n].address })),
  ];
  const snapshot: any[] = [];
  for (const { name, addr } of allAddrs) {
    const celo = await publicClient.getBalance({ address: addr });
    const usdt = (await publicClient.readContract({
      address: MOCK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [addr],
    })) as bigint;
    const row = {
      name,
      address: addr,
      celo: Number(celo) / 1e18,
      usdt: Number(usdt) / 1e6,
    };
    snapshot.push(row);
    console.log(
      `  ${name.padEnd(10)} ${addr}  ${row.celo.toFixed(4).padStart(8)} CELO   ${row.usdt.toFixed(2).padStart(10)} USDT`,
    );
  }

  // --- 6. Save setup artifact
  const setupData = {
    timestamp: new Date().toISOString(),
    wallets: Object.fromEntries(
      WALLET_NAMES.map((n) => [n, { address: wallets[n].address, freshlyGenerated: wallets[n].created }]),
    ),
    funding: {
      celo: celoTxs,
      usdt: usdtTxs,
    },
    mediator: {
      address: mediatorAddr,
      approveTx: mediatorTx,
    },
    balanceSnapshot: snapshot,
  };
  const outPath = path.join("deployments", "celo-sepolia-smoke-setup.json");
  fs.writeFileSync(outPath, JSON.stringify(setupData, null, 2));
  console.log(`\nSaved: ${outPath}`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  console.error(e);
  process.exitCode = 1;
});
