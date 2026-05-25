/**
 * scripts/multisig/verify-ownership.ts — Read-only audit of the
 * post-rotation ownership state.
 *
 * Reads `owner()` of every Etalo V2 contract + the 3 treasury
 * assignments on EtaloEscrow and asserts they all match the expected
 * Safe address (from SAFE_ADDRESS env). Anyone can run this — no
 * private key needed beyond what's already in `.env` for RPC access
 * (and even that can be overridden with a public RPC).
 *
 * Required env :
 *   SAFE_ADDRESS           expected new owner / treasury (the multisig)
 *   CELO_SEPOLIA_RPC       (sepolia) or CELO_MAINNET_RPC (mainnet)
 *
 * Env-var "flag" :
 *   MULTISIG_NETWORK       celoSepolia (default) | celoMainnet
 *
 * Usage :
 *   SAFE_ADDRESS=0x… npx hardhat run scripts/multisig/verify-ownership.ts \
 *     --network celoSepolia
 *
 *   MULTISIG_NETWORK=celoMainnet SAFE_ADDRESS=0x… npx hardhat run \
 *     scripts/multisig/verify-ownership.ts --network celoMainnet
 *
 * Exit codes :
 *   0  — every owner / treasury matches the expected Safe
 *   1  — at least one mismatch (printed to stderr with detail)
 */
import "dotenv/config";
import {
  createPublicClient,
  defineChain,
  http,
  isAddress,
  getAddress,
  parseAbi,
} from "viem";
import * as fs from "fs";

// EtaloCredits is the J7 deploy (unchanged across v1.3 redeploy).
// Same shape as transfer-ownership.ts OVERRIDES.
const OVERRIDES = {
  celoSepolia: {
    EtaloCredits: "0x778a6bda524F4D396F9566c0dF131F76b0E15CA3" as `0x${string}`,
  },
  celoMainnet: {},
} as const;

const NETWORKS = {
  celoSepolia: {
    chainId: 11142220,
    name: "Celo Sepolia",
    rpc: process.env.CELO_SEPOLIA_RPC ?? "https://celo-sepolia.drpc.org",
    explorer: "https://celo-sepolia.blockscout.com",
    deploymentFile: "deployments/celo-sepolia-v2.json",
  },
  celoMainnet: {
    chainId: 42220,
    name: "Celo Mainnet",
    rpc: process.env.CELO_MAINNET_RPC ?? "https://forno.celo.org",
    explorer: "https://celoscan.io",
    deploymentFile: "deployments/celo-mainnet-v2.json",
  },
} as const;

const ownableAbi = parseAbi([
  "function owner() view returns (address)",
]);

const escrowTreasuryAbi = parseAbi([
  "function commissionTreasury() view returns (address)",
  "function creditsTreasury() view returns (address)",
  "function communityFund() view returns (address)",
]);

const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
]);

const OWNABLE_CONTRACTS = [
  "EtaloReputation",
  "EtaloStake",
  "EtaloVoting",
  "EtaloDispute",
  "EtaloEscrow",
  "EtaloCredits",
] as const;

async function main() {
  const network = process.env.MULTISIG_NETWORK ?? "celoSepolia";
  if (!(network in NETWORKS)) {
    console.error(`MULTISIG_NETWORK must be one of: ${Object.keys(NETWORKS).join(", ")}. Got "${network}".`);
    process.exit(1);
  }
  const cfg = NETWORKS[network as keyof typeof NETWORKS];

  const safeAddrRaw = process.env.SAFE_ADDRESS;
  if (!safeAddrRaw || !isAddress(safeAddrRaw)) {
    console.error(`SAFE_ADDRESS missing or invalid in .env (got "${safeAddrRaw}").`);
    process.exit(1);
  }
  const SAFE = getAddress(safeAddrRaw);

  if (!fs.existsSync(cfg.deploymentFile)) {
    console.error(`Deployment file ${cfg.deploymentFile} not found.`);
    process.exit(1);
  }
  const dep = JSON.parse(fs.readFileSync(cfg.deploymentFile, "utf8"));
  const overrides = OVERRIDES[network as keyof typeof OVERRIDES] as Record<string, `0x${string}` | undefined>;
  const resolve = (name: string): `0x${string}` => {
    const fromJson = dep.contracts?.[name]?.address;
    if (fromJson) return getAddress(fromJson);
    const fromOverride = overrides[name];
    if (fromOverride) return getAddress(fromOverride);
    console.error(`${name} not found in ${cfg.deploymentFile} and no override for ${network}.`);
    process.exit(1);
  };

  const chain = defineChain({
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpc] } },
    blockExplorers: { default: { name: "Explorer", url: cfg.explorer } },
    testnet: cfg.chainId !== 42220,
  });
  const pub = createPublicClient({ chain, transport: http(cfg.rpc) });

  console.log(`=== Multisig ownership audit — ${cfg.name} ===`);
  console.log(`Expected Safe : ${SAFE}\n`);

  let failures = 0;
  let warnings = 0;

  // ── Safe sanity (best-effort) ─────────────────────────────
  // Reads getOwners + getThreshold. If the Safe address isn't a real
  // Safe (or is on a different version), these calls revert ; we log
  // a warning but don't fail (the contract-owner checks below are
  // the load-bearing verification).
  console.log(`--- Safe sanity ---`);
  try {
    const safeCode = await pub.getCode({ address: SAFE });
    if (!safeCode || safeCode === "0x") {
      console.log(`  ⚠️  ${SAFE} has NO bytecode on ${cfg.name} — not a deployed contract. Ownership transfer to this address would be fatal.`);
      warnings++;
    } else {
      const owners = (await pub.readContract({
        address: SAFE, abi: safeAbi, functionName: "getOwners",
      })) as readonly `0x${string}`[];
      const threshold = (await pub.readContract({
        address: SAFE, abi: safeAbi, functionName: "getThreshold",
      })) as bigint;
      console.log(`  Safe owners (${owners.length}) :`);
      for (const o of owners) console.log(`    - ${o}`);
      console.log(`  Threshold : ${threshold}-of-${owners.length}`);
      if (threshold < 2n) {
        console.log(`  ⚠️  Threshold < 2 — multisig defeated. Investigate.`);
        warnings++;
      }
    }
  } catch (e) {
    console.log(`  ⚠️  Safe ABI calls failed — address may not be a Gnosis Safe (or is on a different version). Warning only.`);
    warnings++;
  }

  // ── Contract ownership ────────────────────────────────────
  console.log(`\n--- Contract ownership (must == Safe) ---`);
  for (const c of OWNABLE_CONTRACTS) {
    const addr = resolve(c);
    const owner = (await pub.readContract({
      address: addr, abi: ownableAbi, functionName: "owner",
    })) as `0x${string}`;
    const matches = getAddress(owner) === SAFE;
    const marker = matches ? "✅" : "❌";
    console.log(`  ${marker} ${c.padEnd(20)} owner = ${owner}${matches ? "" : `  (expected ${SAFE})`}`);
    if (!matches) failures++;
  }

  // ── Treasury assignments on EtaloEscrow ──────────────────
  console.log(`\n--- Treasury assignments on EtaloEscrow (must == Safe) ---`);
  const escrow = resolve("EtaloEscrow");
  const treasuryGetters = ["commissionTreasury", "creditsTreasury", "communityFund"] as const;
  for (const t of treasuryGetters) {
    const cur = (await pub.readContract({
      address: escrow, abi: escrowTreasuryAbi, functionName: t,
    })) as `0x${string}`;
    const matches = getAddress(cur) === SAFE;
    const marker = matches ? "✅" : "❌";
    console.log(`  ${marker} ${t.padEnd(20)} = ${cur}${matches ? "" : `  (expected ${SAFE})`}`);
    if (!matches) failures++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Failures : ${failures}  (must be 0)`);
  console.log(`Warnings : ${warnings}  (best-effort Safe sanity)`);

  if (failures > 0) {
    console.error(`\n❌ ${failures} mismatch(es) — rotation incomplete or wrong Safe address.`);
    process.exit(1);
  }
  console.log(`\n✅ All 9 ownership / treasury reads match the Safe address.`);
  console.log(`   Cross-check on the explorer : ${cfg.explorer}/address/${SAFE}`);
}

main().catch((e) => {
  console.error("FATAL:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
