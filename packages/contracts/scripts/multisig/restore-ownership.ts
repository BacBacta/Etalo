/**
 * scripts/multisig/restore-ownership.ts — Rotate ownership of the
 * 6 Etalo V2 contracts AND the 3 treasury assignments FROM the Safe
 * BACK to the deployer EOA, via Safe-mediated transactions signed by
 * 2 EOAs (no mobile-passkey required).
 *
 * Use case: after a Sepolia rehearsal, restore the deployer-owned
 * state so smoke scripts (sanction-regression, dispute-n3-force-close,
 * dust-cap) remain runnable without driving every admin call through
 * Safe Wallet UI.
 *
 * Pre-conditions :
 *   1. transfer-ownership.ts has already run — Safe owns the 6
 *      contracts.
 *   2. The Safe has both deployer + a 2nd EOA as owners (Sepolia
 *      rehearsal pattern : deployer + CHIOMA).
 *   3. Threshold is 2 (or less) so deployer + 2nd EOA suffice.
 *
 * Refuses to run on mainnet by default (gated by RESTORE_MAINNET=1).
 * Rationale : restoring ownership to a single EOA on mainnet defeats
 * the whole point of the multisig. The only legitimate mainnet use
 * is emergency recovery — and that needs an explicit flag + manual
 * authorisation in MULTISIG_OPS.md.
 *
 * Env-var "flags" :
 *   MULTISIG_NETWORK         celoSepolia (default) | celoMainnet
 *   SAFE_ADDRESS             current Safe (will be old-owner)
 *   NEW_OWNER                target EOA (default: deployer from
 *                            PRIVATE_KEY)
 *   SIGNER_2_PK_ENV          2nd Safe owner PK env name
 *                            (default: TEST_CHIOMA_PK)
 *   DRY_RUN=1                build + sign + log, no broadcast
 *   RESTORE_MAINNET=1        required to bypass mainnet refusal
 *
 * Usage :
 *   SAFE_ADDRESS=0x… npx hardhat run \
 *     scripts/multisig/restore-ownership.ts --network celoSepolia
 */
import "dotenv/config";
import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  http,
  isAddress,
  getAddress,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import Safe from "@safe-global/protocol-kit";
import * as fs from "fs";

const NETWORKS = {
  celoSepolia: {
    chainId: 11142220,
    name: "Celo Sepolia",
    rpc: process.env.CELO_SEPOLIA_RPC ?? "https://celo-sepolia.drpc.org",
    explorer: "https://celo-sepolia.blockscout.com",
    deploymentFile: "deployments/celo-sepolia-v2.json",
    isMainnet: false,
  },
  celoMainnet: {
    chainId: 42220,
    name: "Celo Mainnet",
    rpc: process.env.CELO_MAINNET_RPC ?? "https://forno.celo.org",
    explorer: "https://celoscan.io",
    deploymentFile: "deployments/celo-mainnet-v2.json",
    isMainnet: true,
  },
} as const;

const OVERRIDES = {
  celoSepolia: {
    EtaloCredits: "0x778a6bda524F4D396F9566c0dF131F76b0E15CA3" as `0x${string}`,
  },
  celoMainnet: {},
} as const;

const ownableAbi = parseAbi([
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)",
]);
const escrowTreasuryAbi = parseAbi([
  "function commissionTreasury() view returns (address)",
  "function creditsTreasury() view returns (address)",
  "function communityFund() view returns (address)",
  "function setCommissionTreasury(address newTreasury)",
  "function setCreditsTreasury(address newTreasury)",
  "function setCommunityFund(address newFund)",
]);

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === "1" || v === "true";
}

function parseEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function pkFromEnv(env: Record<string, string>, key: string): `0x${string}` {
  const v = env[key];
  if (!v) throw new Error(`${key} missing from .env`);
  return `0x${v.replace(/^0x/, "")}` as `0x${string}`;
}

async function main() {
  const network = process.env.MULTISIG_NETWORK ?? "celoSepolia";
  if (!(network in NETWORKS)) {
    throw new Error(`MULTISIG_NETWORK must be one of: ${Object.keys(NETWORKS).join(", ")}`);
  }
  const cfg = NETWORKS[network as keyof typeof NETWORKS];
  const dryRun = envFlag("DRY_RUN");

  if (cfg.isMainnet && !envFlag("RESTORE_MAINNET") && !dryRun) {
    throw new Error(
      "Refusing to restore ownership on MAINNET without RESTORE_MAINNET=1. " +
      "This collapses 2-of-3 multisig security back to a single EOA — only " +
      "legitimate use case is emergency recovery (see docs/MULTISIG_OPS.md §4)."
    );
  }

  const env = parseEnv();
  const safeAddrRaw = process.env.SAFE_ADDRESS;
  if (!safeAddrRaw || !isAddress(safeAddrRaw)) {
    throw new Error(`SAFE_ADDRESS missing/invalid (got "${safeAddrRaw}").`);
  }
  const SAFE = getAddress(safeAddrRaw);

  const pk1 = pkFromEnv(env, "PRIVATE_KEY");
  const pk2 = pkFromEnv(env, process.env.SIGNER_2_PK_ENV ?? "TEST_CHIOMA_PK");
  const signer1 = privateKeyToAccount(pk1);
  const signer2 = privateKeyToAccount(pk2);

  const newOwnerRaw = process.env.NEW_OWNER ?? signer1.address;
  if (!isAddress(newOwnerRaw)) {
    throw new Error(`NEW_OWNER invalid (got "${newOwnerRaw}").`);
  }
  const NEW_OWNER = getAddress(newOwnerRaw);

  // Deployments + overrides
  if (!fs.existsSync(cfg.deploymentFile)) {
    throw new Error(`Deployment file ${cfg.deploymentFile} not found.`);
  }
  const dep = JSON.parse(fs.readFileSync(cfg.deploymentFile, "utf8"));
  const overrides = OVERRIDES[network as keyof typeof OVERRIDES] as Record<string, `0x${string}` | undefined>;
  const resolve = (name: string): `0x${string}` => {
    const fromJson = dep.contracts?.[name]?.address;
    if (fromJson) return getAddress(fromJson);
    const fromOverride = overrides[name];
    if (fromOverride) return getAddress(fromOverride);
    throw new Error(`${name} not in ${cfg.deploymentFile} or overrides.`);
  };

  const OWNABLE_CONTRACTS = [
    "EtaloReputation", "EtaloStake", "EtaloVoting",
    "EtaloDispute", "EtaloEscrow", "EtaloCredits",
  ] as const;
  const ESCROW = resolve("EtaloEscrow");

  const chain = defineChain({
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpc] } },
    blockExplorers: { default: { name: "Explorer", url: cfg.explorer } },
    testnet: !cfg.isMainnet,
  });
  const pub = createPublicClient({ chain, transport: http(cfg.rpc) });

  console.log("=== Restore ownership : Safe → EOA ===");
  console.log(`Network    : ${cfg.name}`);
  console.log(`Safe       : ${SAFE}`);
  console.log(`New owner  : ${NEW_OWNER}`);
  console.log(`Mode       : ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  // Pre-flight : owners + threshold sanity
  const sdkSig1 = await Safe.init({
    provider: cfg.rpc, signer: pk1, safeAddress: SAFE,
  });
  const owners = (await sdkSig1.getOwners()).map((o) => getAddress(o));
  const threshold = await sdkSig1.getThreshold();
  console.log(`Safe owners : ${owners.join(", ")}`);
  console.log(`Threshold   : ${threshold}\n`);

  if (!owners.includes(signer1.address)) throw new Error(`Signer 1 ${signer1.address} not a Safe owner.`);
  if (!owners.includes(signer2.address)) throw new Error(`Signer 2 ${signer2.address} not a Safe owner.`);
  if (threshold > 2) throw new Error(`Threshold ${threshold} > 2 ; this script only collects 2 sigs.`);

  // Build the 9-tx batch
  const txs: { name: string; to: `0x${string}`; data: `0x${string}` }[] = [];

  // ORDER CONSTRAINT (Sepolia rehearsal 2026-05-25 lesson learned):
  // setCommissionTreasury / setCreditsTreasury / setCommunityFund
  // are `onlyOwner` — so the Safe MUST do them BEFORE giving up
  // ownership of EtaloEscrow. Otherwise the Safe loses owner status
  // mid-batch and the treasury setters revert with
  // OwnableUnauthorizedAccount. Order :
  //   Phase 1 : non-Escrow contract ownership (5 txs, any order)
  //   Phase 2 : Escrow treasuries (3 txs, Safe still owns Escrow)
  //   Phase 3 : EtaloEscrow.transferOwnership(NEW_OWNER) (1 tx, last)

  // Phase 1 : 5 non-Escrow contracts
  const PHASE_1 = OWNABLE_CONTRACTS.filter((c) => c !== "EtaloEscrow");
  for (const c of PHASE_1) {
    const addr = resolve(c);
    const currentOwner = (await pub.readContract({
      address: addr, abi: ownableAbi, functionName: "owner",
    })) as `0x${string}`;
    if (getAddress(currentOwner) === NEW_OWNER) {
      console.log(`  [SKIP] ${c} already owned by NEW_OWNER`);
      continue;
    }
    if (getAddress(currentOwner) !== SAFE) {
      throw new Error(`${c} owner ${currentOwner} is neither Safe nor NEW_OWNER — refuse to rotate.`);
    }
    const data = encodeFunctionData({
      abi: ownableAbi, functionName: "transferOwnership", args: [NEW_OWNER],
    });
    txs.push({ name: `${c}.transferOwnership(NEW_OWNER)`, to: addr, data });
  }

  // Phase 2 : Escrow treasuries (while Safe still owns Escrow)
  const treasurySteps = [
    { name: "setCommissionTreasury", getter: "commissionTreasury" as const },
    { name: "setCreditsTreasury", getter: "creditsTreasury" as const },
    { name: "setCommunityFund", getter: "communityFund" as const },
  ];
  for (const s of treasurySteps) {
    const cur = (await pub.readContract({
      address: ESCROW, abi: escrowTreasuryAbi, functionName: s.getter,
    })) as `0x${string}`;
    if (getAddress(cur) === NEW_OWNER) {
      console.log(`  [SKIP] EtaloEscrow.${s.name} already NEW_OWNER`);
      continue;
    }
    const data = encodeFunctionData({
      abi: escrowTreasuryAbi, functionName: s.name as any, args: [NEW_OWNER],
    });
    txs.push({ name: `EtaloEscrow.${s.name}(NEW_OWNER)`, to: ESCROW, data });
  }

  // Phase 3 : EtaloEscrow.transferOwnership last
  const escrowOwner = (await pub.readContract({
    address: ESCROW, abi: ownableAbi, functionName: "owner",
  })) as `0x${string}`;
  if (getAddress(escrowOwner) === NEW_OWNER) {
    console.log(`  [SKIP] EtaloEscrow already owned by NEW_OWNER`);
  } else if (getAddress(escrowOwner) !== SAFE) {
    throw new Error(`EtaloEscrow owner ${escrowOwner} is neither Safe nor NEW_OWNER — refuse to rotate.`);
  } else {
    const data = encodeFunctionData({
      abi: ownableAbi, functionName: "transferOwnership", args: [NEW_OWNER],
    });
    txs.push({ name: `EtaloEscrow.transferOwnership(NEW_OWNER)`, to: ESCROW, data });
  }

  if (txs.length === 0) {
    console.log("\nNothing to do — all 9 reads already match NEW_OWNER.");
    return;
  }

  console.log(`\n--- Plan (${txs.length} Safe txs) ---`);
  txs.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}  →  ${t.to}`));

  if (dryRun) {
    console.log(`\n✅ DRY RUN — no Safe txs assembled or broadcast.`);
    return;
  }

  // ── Execute each tx as its own Safe tx ────────────────────
  // We do them one-at-a-time so any revert mid-batch is contained
  // and the script can be safely re-run (idempotent SKIP guards
  // above handle the resume).
  console.log(`\n--- Executing ---`);
  const results: { step: number; name: string; hash: string }[] = [];

  for (let i = 0; i < txs.length; i++) {
    const t = txs[i];
    console.log(`\n[${i + 1}/${txs.length}] ${t.name}`);

    // Re-init both SDKs each iteration so they read the freshly
    // incremented Safe nonce on chain. Without this the SDK caches
    // the original nonce and the 2nd iteration reverts with GS026
    // ("Invalid signatures") because the proposed tx hash mismatches
    // what the on-chain Safe expects for the current nonce.
    const sdk1 = await Safe.init({
      provider: cfg.rpc, signer: pk1, safeAddress: SAFE,
    });
    const sdk2 = await Safe.init({
      provider: cfg.rpc, signer: pk2, safeAddress: SAFE,
    });

    const safeTx = await sdk1.createTransaction({
      transactions: [{ to: t.to, value: "0", data: t.data }],
    });
    const safeTxHash = await sdk1.getTransactionHash(safeTx);
    console.log(`  Safe tx hash : ${safeTxHash}`);

    const sig1 = await sdk1.signTransaction(safeTx);
    const sig2 = await sdk2.signTransaction(sig1);

    const exec = await sdk1.executeTransaction(sig2);
    const hash = exec.hash as `0x${string}`;
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`Safe tx ${i + 1} reverted (tx ${hash}).`);
    }
    console.log(`  ✅ ${cfg.explorer}/tx/${hash}`);
    results.push({ step: i + 1, name: t.name, hash });
  }

  const outPath = `scripts/multisig/restore-ownership-${network}-result.json`;
  fs.writeFileSync(outPath, JSON.stringify({
    network: cfg.name,
    chainId: cfg.chainId,
    safe: SAFE,
    newOwner: NEW_OWNER,
    executedAt: new Date().toISOString(),
    txs: results,
  }, null, 2));
  console.log(`\n✅ ${results.length} Safe tx(s) executed. Saved to ${outPath}.`);
  console.log(`\nNext : SAFE_ADDRESS=${NEW_OWNER} npx hardhat run scripts/multisig/verify-ownership.ts --network ${network}`);
  console.log(`       (expect all 9 reads to == NEW_OWNER)`);
}

main().catch((e) => {
  console.error("\nFATAL:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
