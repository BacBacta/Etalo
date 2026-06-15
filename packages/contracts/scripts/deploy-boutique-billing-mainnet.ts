/**
 * deploy-boutique-billing-mainnet.ts — deploy EtaloBoutiqueBilling
 * (ADR-059, one-time 1 USDT boutique creation fee) to Celo mainnet.
 *
 * The constructor sets `_admin` = the 2-of-3 Safe directly, so the
 * contract is owned by the Safe from block 0 — no separate
 * transferOwnership step (unlike the escrow). `commissionTreasury` is
 * taken from the mainnet deployment JSON (the Safe, per ADR-024/059).
 *
 * ⚠️ Deploys a fund-moving contract to mainnet. Run ONLY by the deployer
 * EOA (a Safe owner), after the ADR-059 self-audit + the project's
 * pre-mainnet review gate, with explicit confirmation. Legacy tx only
 * (CLAUDE.md rule #3 — no EIP-1559 on Celo V1).
 *
 * Holds no funds and has no privileged fund movement, so this is far
 * lower-risk than the escrow deploy — but the mainnet guard stays.
 *
 * Env (.env):
 *   PRIVATE_KEY              — deployer EOA (a Safe owner)
 *   SAFE_OWNER_ADDR          — 2-of-3 Safe; becomes owner (admin) at construction
 *   CONFIRM_MAINNET_DEPLOY   — must equal "yes" (accident guard)
 *   CELO_RPC                 — optional (default forno)
 *
 * Usage:
 *   CONFIRM_MAINNET_DEPLOY=yes SAFE_OWNER_ADDR=0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F \
 *     npx tsx scripts/deploy-boutique-billing-mainnet.ts
 *
 * After deploy:
 *   - Record the address in deployments/celo-mainnet-v2.json + CLAUDE.md.
 *   - Set NEXT_PUBLIC_BOUTIQUE_BILLING_ADDRESS (Vercel) +
 *     ETALO_BOUTIQUE_BILLING_ADDRESS (Fly).
 *   - At launch, set FEES_ENFORCED_FROM / NEXT_PUBLIC_FEES_ENFORCED_FROM
 *     = submission-date + 60 days. Until then, creation stays free.
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
    throw new Error(
      "Refusing to deploy: set CONFIRM_MAINNET_DEPLOY=yes to proceed (mainnet fund-moving contract).",
    );
  }
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set");
  const safe = envAddr("SAFE_OWNER_ADDR");

  const dep = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
  const usdt = getAddress(dep.realUsdt);
  const commission = getAddress(dep.treasuries.commission);

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: celoMainnet, transport });
  const walletClient = createWalletClient({ account, chain: celoMainnet, transport });

  console.log("=== EtaloBoutiqueBilling mainnet deploy (ADR-059) ===");
  console.log(`Deployer: ${account.address}`);
  console.log(`USDT: ${usdt}`);
  console.log(`commissionTreasury: ${commission}`);
  console.log(`owner/admin (Safe): ${safe}`);

  const { abi, bytecode } = loadArtifact("EtaloBoutiqueBilling");
  const gasPrice = await publicClient.getGasPrice();

  const data = encodeDeployData({
    abi,
    bytecode,
    args: [usdt, commission, safe] as const,
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

  // Sanity reads — owner must already be the Safe (set at construction).
  const reads: Array<[string, `0x${string}`]> = [
    ["usdt", usdt],
    ["commissionTreasury", commission],
    ["owner", safe],
  ];
  for (const [fn, expected] of reads) {
    const got = getAddress(
      (await publicClient.readContract({ address, abi, functionName: fn })) as `0x${string}`,
    );
    console.log(got === expected ? `  [OK] ${fn}=${got}` : `  [MISMATCH] ${fn}: ${got} != ${expected}`);
  }
  const fee = (await publicClient.readContract({ address, abi, functionName: "CREATION_FEE" })) as bigint;
  console.log(fee === 1_000_000n ? `  [OK] CREATION_FEE=1 USDT` : `  [WARN] CREATION_FEE=${fee}`);

  dep.contracts = dep.contracts || {};
  dep.contracts.EtaloBoutiqueBilling = {
    address,
    deployedBlock: Number(receipt.blockNumber),
    adr: "ADR-059",
    owner: safe,
    note: "One-time boutique creation fee (1 USDT) → commissionTreasury (Safe)",
  };
  fs.writeFileSync(DEPLOYMENT_PATH, JSON.stringify(dep, null, 2) + "\n");

  console.log(`\n✅ Deployed (owner = Safe at construction). BILLING=${address}`);
  console.log("NEXT: set NEXT_PUBLIC_BOUTIQUE_BILLING_ADDRESS (Vercel) +");
  console.log("ETALO_BOUTIQUE_BILLING_ADDRESS (Fly). At launch set FEES_ENFORCED_FROM");
  console.log("(+ NEXT_PUBLIC_FEES_ENFORCED_FROM) = submission-date + 60 days.");
  console.log("Record the address in CLAUDE.md (Key addresses — mainnet).");
}

main().catch((e) => { console.error(e); process.exit(1); });
