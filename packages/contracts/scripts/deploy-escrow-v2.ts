/**
 * deploy-escrow-v2.ts — deploy the ADR-057 EtaloEscrow to Celo mainnet
 * and wire its setters, then hand ownership to the 2-of-3 Safe.
 *
 * This is the deployment step of the migration plan (Option A, §3). It
 * does NOT cut anything over and does NOT touch the old escrow or any
 * funds — the satellite re-pointing is a separate, Safe-signed step
 * (scripts/escrow-cutover-calldata.ts), executed only AFTER the old
 * escrow has fully drained (scripts/escrow-drain-monitor.ts → 0).
 *
 * ⚠️ Deploys a custody contract to mainnet. Run ONLY after the ADR-057
 * re-audit, by the deployer EOA, with explicit confirmation. Legacy tx
 * only (CLAUDE.md rule #3 — no EIP-1559 on Celo V1).
 *
 * Env (.env):
 *   PRIVATE_KEY              — deployer EOA (will be temporary owner)
 *   SAFE_OWNER_ADDR          — 2-of-3 Safe; ownership is transferred to it
 *   CONFIRM_MAINNET_DEPLOY   — must equal "yes" (accident guard)
 *   CELO_RPC                 — optional (default forno)
 *
 * Usage:
 *   CONFIRM_MAINNET_DEPLOY=yes SAFE_OWNER_ADDR=0x... \
 *     npx hardhat run scripts/deploy-escrow-v2.ts --network celoMainnet
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

const RPC_URL = process.env.CELO_RPC ?? "https://forno.celo.org";
const DEPLOYMENT_PATH = path.join("deployments", "celo-mainnet-v2.json");

const celoMainnet = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "CeloScan", url: "https://celoscan.io" } },
});

function loadArtifact(name: string) {
  const p = path.join("artifacts", "contracts", `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`Artifact missing: ${p}. Run: npx hardhat compile`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode as `0x${string}` };
}

function envAddr(name: string): `0x${string}` {
  const v = process.env[name];
  if (!v || !isAddress(v)) throw new Error(`${name} missing/invalid in .env`);
  return getAddress(v);
}

async function main() {
  if (process.env.CONFIRM_MAINNET_DEPLOY !== "yes") {
    throw new Error("Refusing to deploy: set CONFIRM_MAINNET_DEPLOY=yes to proceed (mainnet custody contract).");
  }
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set");
  const safe = envAddr("SAFE_OWNER_ADDR");

  const dep = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
  const usdt = getAddress(dep.realUsdt);
  const commission = getAddress(dep.treasuries.commission);
  const credits = getAddress(dep.treasuries.credits);
  const community = getAddress(dep.treasuries.community);
  const reputation = getAddress(dep.contracts.EtaloReputation.address);
  const stake = getAddress(dep.contracts.EtaloStake.address);
  const dispute = getAddress(dep.contracts.EtaloDispute.address);

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: celoMainnet, transport });
  const walletClient = createWalletClient({ account, chain: celoMainnet, transport });

  console.log("=== EtaloEscrow ADR-057 mainnet deploy ===");
  console.log(`Deployer: ${account.address}`);
  console.log(`USDT: ${usdt}  Safe(owner-to-be): ${safe}`);
  console.log(`Satellites: rep=${reputation} stake=${stake} dispute=${dispute}`);

  const { abi, bytecode } = loadArtifact("EtaloEscrow");
  const gasPrice = await publicClient.getGasPrice();

  // Deploy
  const data = encodeDeployData({ abi, bytecode, args: [usdt] as const });
  const gas = await publicClient.estimateGas({ account: account.address, data });
  const txHash = await walletClient.sendTransaction({ data, type: "legacy" as any, gasPrice, gas: (gas * 120n) / 100n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const address = getAddress(receipt.contractAddress!);
  console.log(`Deployed EtaloEscrow: ${address} (block ${receipt.blockNumber})`);

  // Wire setters (legacy tx each)
  const wires: Array<[string, readonly unknown[]]> = [
    ["setCommissionTreasury", [commission]],
    ["setCreditsTreasury", [credits]],
    ["setCommunityFund", [community]],
    ["setReputationContract", [reputation]],
    ["setStakeContract", [stake]],
    ["setDisputeContract", [dispute]],
  ];
  for (const [fn, args] of wires) {
    const h = await walletClient.writeContract({ address, abi, functionName: fn, args, type: "legacy" as any, gasPrice });
    await publicClient.waitForTransactionReceipt({ hash: h });
    console.log(`  wired ${fn}(${args.join(", ")})`);
  }

  // Sanity reads
  const reads: Array<[string, `0x${string}`]> = [
    ["usdt", usdt],
    ["commissionTreasury", commission],
    ["reputation", reputation],
    ["dispute", dispute],
  ];
  for (const [fn, expected] of reads) {
    const got = getAddress((await publicClient.readContract({ address, abi, functionName: fn })) as `0x${string}`);
    console.log(got === expected ? `  [OK] ${fn}=${got}` : `  [MISMATCH] ${fn}: ${got} != ${expected}`);
  }

  // Hand ownership to the Safe (final step — deployer relinquishes control)
  const oh = await walletClient.writeContract({ address, abi, functionName: "transferOwnership", args: [safe], type: "legacy" as any, gasPrice });
  await publicClient.waitForTransactionReceipt({ hash: oh });
  const owner = getAddress((await publicClient.readContract({ address, abi, functionName: "owner" })) as `0x${string}`);
  console.log(owner === safe ? `  [OK] ownership → Safe ${owner}` : `  [WARN] owner is ${owner}, expected Safe ${safe}`);

  console.log(`\n✅ Deployed + wired. NEW_ESCROW=${address}`);
  console.log("NEXT (do NOT skip): keep old escrow live, freeze new intake, run");
  console.log("escrow-drain-monitor until 0, then escrow-cutover-calldata + Safe txs.");
  console.log("Record the address in CLAUDE.md + deployments/celo-mainnet-v2.json (previous_deployments[]).");
}

main().catch((e) => { console.error(e); process.exit(1); });
