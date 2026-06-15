/**
 * deploy-boutique-billing-sepolia.ts — deploy EtaloBoutiqueBilling
 * (ADR-059, one-time boutique creation fee = 1 USDT) on Celo Sepolia.
 *
 * Standalone payment-rail contract (no satellites to wire). Reads the
 * existing Sepolia MockUSDT + commissionTreasury from the deployment
 * JSON, deploys, sanity-reads, and KEEPS the deployer as owner. It does
 * NOT touch any other contract. The address is appended to
 * deployments/celo-sepolia-v2.json under contracts.EtaloBoutiqueBilling.
 *
 * Mainnet equivalent is a Safe operation (Mike) — this script is for
 * Sepolia validation only. Legacy tx only (CLAUDE.md rule #3).
 *
 * Env (.env):
 *   PRIVATE_KEY        — deployer EOA (stays owner)
 *   CELO_SEPOLIA_RPC   — optional (default drpc.org)
 *
 * Usage:
 *   npx tsx scripts/deploy-boutique-billing-sepolia.ts
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = process.env.CELO_SEPOLIA_RPC ?? "https://celo-sepolia.drpc.org";
const DEPLOYMENT_PATH = path.join("deployments", "celo-sepolia-v2.json");

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "CeloScan", url: "https://sepolia.celoscan.io" } },
  testnet: true,
});

function loadArtifact(name: string) {
  const p = path.join("artifacts", "contracts", `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`Artifact missing: ${p}. Run: npx hardhat compile`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode as `0x${string}` };
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");

  const dep = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
  const c = dep.contracts;
  const usdt = getAddress(c.MockUSDT.address);
  const commission = getAddress(dep.treasuries.commission);

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: celoSepolia, transport });
  const walletClient = createWalletClient({ account, chain: celoSepolia, transport });

  console.log("=== EtaloBoutiqueBilling SEPOLIA deploy (ADR-059) ===");
  console.log(`Deployer/owner: ${account.address}`);
  console.log(`USDT(mock): ${usdt}`);
  console.log(`commissionTreasury: ${commission}`);

  const { abi, bytecode } = loadArtifact("EtaloBoutiqueBilling");
  const gasPrice = await publicClient.getGasPrice();

  const data = encodeDeployData({
    abi,
    bytecode,
    args: [usdt, commission, account.address] as const,
  });
  const gas = await publicClient.estimateGas({ account: account.address, data });
  const txHash = await walletClient.sendTransaction({
    data,
    type: "legacy" as any,
    gasPrice,
    gas: (gas * 120n) / 100n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const address = getAddress(receipt.contractAddress!);
  console.log(`Deployed EtaloBoutiqueBilling: ${address} (block ${receipt.blockNumber})`);

  // Sanity reads — confirm the live bytecode carries the ADR-059 config.
  const reads: Array<[string, `0x${string}`]> = [
    ["usdt", usdt],
    ["commissionTreasury", commission],
    ["owner", getAddress(account.address)],
  ];
  for (const [fn, expected] of reads) {
    const got = getAddress(
      (await publicClient.readContract({ address, abi, functionName: fn })) as `0x${string}`
    );
    console.log(got === expected ? `  [OK] ${fn}=${got}` : `  [MISMATCH] ${fn}: ${got} != ${expected}`);
  }
  const fee = (await publicClient.readContract({ address, abi, functionName: "CREATION_FEE" })) as bigint;
  console.log(fee === 1_000_000n ? `  [OK] CREATION_FEE=1 USDT` : `  [WARN] CREATION_FEE=${fee}`);

  // Persist the address into the deployment JSON.
  dep.contracts.EtaloBoutiqueBilling = {
    address,
    deployedBlock: Number(receipt.blockNumber),
    adr: "ADR-059",
    note: "One-time boutique creation fee (1 USDT) → commissionTreasury",
  };
  fs.writeFileSync(DEPLOYMENT_PATH, JSON.stringify(dep, null, 2) + "\n");
  console.log(`\n✅ Deploy complete. Recorded under contracts.EtaloBoutiqueBilling in ${DEPLOYMENT_PATH}`);
  console.log("Owner kept as deployer (Sepolia). Set NEXT_PUBLIC_BOUTIQUE_BILLING_ADDRESS to this address.");
}

main().catch((e) => { console.error(e); process.exit(1); });
