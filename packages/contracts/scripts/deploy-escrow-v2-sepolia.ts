/**
 * deploy-escrow-v2-sepolia.ts — DRY-RUN of the ADR-057 EtaloEscrow
 * redeploy on Celo Sepolia, mirroring scripts/deploy-escrow-v2.ts
 * (mainnet) so the exact deploy+wire sequence is rehearsed before the
 * real thing.
 *
 * Deploys a NEW EtaloEscrow (ADR-057 code: intra-only guard, per-buyer
 * cap, delivery-proof early release) against the EXISTING Sepolia
 * satellites, wires its own setters, sanity-reads them, and KEEPS the
 * deployer as owner (no Safe transfer — this is a rehearsal). It does
 * NOT cut anything over: the satellites (Dispute/Stake/Reputation) are
 * never re-pointed, so the existing Sepolia escrow keeps working
 * untouched. The reverse-pointing is validated separately via
 * scripts/escrow-cutover-calldata.ts.
 *
 * Legacy tx only (CLAUDE.md rule #3).
 *
 * Env (.env):
 *   PRIVATE_KEY        — deployer EOA (stays owner for the dry-run)
 *   CELO_SEPOLIA_RPC   — optional (default drpc.org)
 *
 * Usage:
 *   npx tsx scripts/deploy-escrow-v2-sepolia.ts
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
  const credits = getAddress(dep.treasuries.credits);
  const community = getAddress(dep.treasuries.community);
  const reputation = getAddress(c.EtaloReputation.address);
  const stake = getAddress(c.EtaloStake.address);
  const dispute = getAddress(c.EtaloDispute.address);

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: celoSepolia, transport });
  const walletClient = createWalletClient({ account, chain: celoSepolia, transport });

  console.log("=== EtaloEscrow ADR-057 SEPOLIA dry-run deploy ===");
  console.log(`Deployer/owner: ${account.address}`);
  console.log(`USDT(mock): ${usdt}`);
  console.log(`Satellites: rep=${reputation} stake=${stake} dispute=${dispute}`);
  console.log(`Old Sepolia escrow (untouched): ${getAddress(c.EtaloEscrow.address)}`);

  const { abi, bytecode } = loadArtifact("EtaloEscrow");
  const gasPrice = await publicClient.getGasPrice();

  const data = encodeDeployData({ abi, bytecode, args: [usdt] as const });
  const gas = await publicClient.estimateGas({ account: account.address, data });
  const txHash = await walletClient.sendTransaction({
    data,
    type: "legacy" as any,
    gasPrice,
    gas: (gas * 120n) / 100n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const address = getAddress(receipt.contractAddress!);
  console.log(`Deployed NEW EtaloEscrow: ${address} (block ${receipt.blockNumber})`);

  const wires: Array<[string, readonly unknown[]]> = [
    ["setCommissionTreasury", [commission]],
    ["setCreditsTreasury", [credits]],
    ["setCommunityFund", [community]],
    ["setReputationContract", [reputation]],
    ["setStakeContract", [stake]],
    ["setDisputeContract", [dispute]],
  ];
  for (const [fn, args] of wires) {
    const h = await walletClient.writeContract({
      address,
      abi,
      functionName: fn,
      args,
      type: "legacy" as any,
      gasPrice,
    });
    await publicClient.waitForTransactionReceipt({ hash: h });
    console.log(`  wired ${fn}(${args.join(", ")})`);
  }

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

  // ADR-057 guard checks (read-only, no funds): confirm the new code is
  // actually live on the deployed bytecode.
  const maxBuyer = (await publicClient.readContract({ address, abi, functionName: "MAX_BUYER_ESCROW_USDT" })) as bigint;
  console.log(maxBuyer === 2500n * 10n ** 6n ? `  [OK] MAX_BUYER_ESCROW_USDT=2500 USDT` : `  [WARN] MAX_BUYER_ESCROW_USDT=${maxBuyer}`);
  const earlyWindow = (await publicClient.readContract({ address, abi, functionName: "EARLY_RELEASE_WINDOW" })) as bigint;
  console.log(earlyWindow === 48n * 3600n ? `  [OK] EARLY_RELEASE_WINDOW=48h (ADR-058)` : `  [WARN] EARLY_RELEASE_WINDOW=${earlyWindow}`);

  console.log(`\n✅ Dry-run deploy + wire complete. NEW_ESCROW=${address}`);
  console.log("Owner kept as deployer (rehearsal). Validate cutover with:");
  console.log(`  NEW_ESCROW=${address} npx tsx scripts/escrow-cutover-calldata.ts`);
}

main().catch((e) => { console.error(e); process.exit(1); });
