/**
 * deploy-credits-v2-mainnet.ts — redeploy EtaloCredits to Celo mainnet
 * with the CORRECT treasury + owner (the Safe).
 *
 * Why: the original mainnet EtaloCredits (0xDDbE5BEC…) was deployed with
 * creditsTreasury = 0x4515D79C…A060AA (a leftover Sepolia EOA, NOT the
 * Safe) and owner = the deployer EOA. `creditsTreasury` is immutable, so
 * fixing it requires a fresh deploy. Off-chain credit balances live in
 * `seller_credits_ledger`, so no seller balance is affected — only the
 * destination of FUTURE credit-purchase USDT moves to the Safe.
 *
 * Standalone contract (no satellites point to it), so the cutover is
 * just: deploy → swap NEXT_PUBLIC_CREDITS_ADDRESS (Vercel) +
 * ETALO_CREDITS_ADDRESS (Fly) → done. Old contract retained for history.
 *
 * ⚠️ Mainnet deploy. Run by the deployer EOA (a Safe owner) with
 * CONFIRM_MAINNET_DEPLOY=yes. Legacy tx only (CLAUDE.md rule #3).
 *
 * Env (.env):
 *   PRIVATE_KEY              — deployer EOA (a Safe owner)
 *   SAFE_OWNER_ADDR          — 2-of-3 Safe; becomes creditsTreasury AND owner
 *   CONFIRM_MAINNET_DEPLOY   — must equal "yes"
 *   CELO_RPC                 — optional (default forno)
 *
 * Usage:
 *   CONFIRM_MAINNET_DEPLOY=yes SAFE_OWNER_ADDR=0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F \
 *     npx tsx scripts/deploy-credits-v2-mainnet.ts
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
    throw new Error("Refusing to deploy: set CONFIRM_MAINNET_DEPLOY=yes (mainnet contract).");
  }
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set");
  const safe = envAddr("SAFE_OWNER_ADDR");

  const dep = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
  const usdt = getAddress(dep.realUsdt);

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: celoMainnet, transport });
  const walletClient = createWalletClient({ account, chain: celoMainnet, transport });

  console.log("=== EtaloCredits mainnet REDEPLOY (fix creditsTreasury → Safe) ===");
  console.log(`Deployer: ${account.address}`);
  console.log(`USDT: ${usdt}`);
  console.log(`creditsTreasury + owner (Safe): ${safe}`);
  console.log(`Old EtaloCredits (retained): ${dep.contracts.EtaloCredits?.address}`);

  const { abi, bytecode } = loadArtifact("EtaloCredits");
  const gasPrice = await publicClient.getGasPrice();

  const args = [usdt, safe, safe] as const; // (_usdt, _creditsTreasury, _admin)
  const data = encodeDeployData({ abi, bytecode, args });
  const gas = await publicClient.estimateGas({ account: account.address, data });
  const txHash = await walletClient.sendTransaction({
    data,
    type: "legacy" as any,
    gasPrice,
    gas: (gas * 120n) / 100n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const address = getAddress(receipt.contractAddress!);
  console.log(`Deployed NEW EtaloCredits: ${address} (block ${receipt.blockNumber})`);

  const reads: Array<[string, `0x${string}`]> = [
    ["usdt", usdt],
    ["creditsTreasury", safe],
    ["owner", safe],
  ];
  for (const [fn, expected] of reads) {
    const got = getAddress(
      (await publicClient.readContract({ address, abi, functionName: fn })) as `0x${string}`,
    );
    console.log(got === expected ? `  [OK] ${fn}=${got}` : `  [MISMATCH] ${fn}: ${got} != ${expected}`);
  }
  const perCredit = (await publicClient.readContract({ address, abi, functionName: "USDT_PER_CREDIT" })) as bigint;
  console.log(perCredit === 150_000n ? `  [OK] USDT_PER_CREDIT=0.15 USDT` : `  [WARN] USDT_PER_CREDIT=${perCredit}`);

  // Retain the old deploy for history, then record the new one.
  dep.previous_deployments = dep.previous_deployments || [];
  if (dep.contracts.EtaloCredits) {
    dep.previous_deployments.push({
      contract: "EtaloCredits",
      ...dep.contracts.EtaloCredits,
      retiredAt: new Date().toISOString(),
      reason: "creditsTreasury was a non-Safe EOA (0x4515…A060AA); redeployed to Safe",
    });
  }
  dep.contracts.EtaloCredits = {
    address,
    txHash,
    block: String(receipt.blockNumber),
    constructorArgs: [usdt, safe, safe],
    note: "Redeploy — creditsTreasury + owner = Safe (fix; ADR-024/ADR-059 follow-up)",
  };
  fs.writeFileSync(DEPLOYMENT_PATH, JSON.stringify(dep, null, 2) + "\n");

  console.log(`\n✅ Redeployed. NEW_CREDITS=${address}`);
  console.log("NEXT: swap NEXT_PUBLIC_CREDITS_ADDRESS (Vercel) + ETALO_CREDITS_ADDRESS (Fly),");
  console.log("redeploy backend (indexer picks up the new contract), then sweep the old");
  console.log("creditsTreasury EOA (0x4515…A060AA) USDT to the Safe.");
}

main().catch((e) => { console.error(e); process.exit(1); });
