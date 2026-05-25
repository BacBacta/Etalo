/**
 * scripts/multisig/transfer-ownership.ts — One-shot rotation of
 * Etalo V2 contracts + treasuries to a multisig Safe.
 *
 * Per ADR-038 + ADR-055 :
 *   - Transfers ownership of 6 OpenZeppelin Ownable contracts
 *     (EtaloReputation, EtaloStake, EtaloVoting, EtaloDispute,
 *      EtaloEscrow, EtaloCredits) from the deployer EOA to the
 *     target Safe address.
 *   - Reassigns the 3 EtaloEscrow treasuries (commissionTreasury,
 *     creditsTreasury, communityFund) to the Safe address so all
 *     revenue accumulates under 2-of-3 control.
 *
 * Total : 9 txs (6 transferOwnership + 3 setTreasury), signed by the
 * deployer in sequence. After execution, the deployer no longer has
 * admin power on any of the 6 contracts — that's intentional and
 * irreversible. Verify with `verify-ownership.ts` immediately after.
 *
 * Required env :
 *   PRIVATE_KEY            current deployer (must match all owners)
 *   SAFE_ADDRESS           target multisig address (validated below)
 *   CELO_SEPOLIA_RPC       (sepolia) or CELO_MAINNET_RPC (mainnet)
 *
 * Env-var "flags" (hardhat 3 doesn't forward CLI args past --) :
 *   MULTISIG_NETWORK       celoSepolia (default) | celoMainnet
 *   DRY_RUN=1              prints planned txs, no broadcast
 *   CONFIRM_MAINNET=1      required for live celoMainnet runs
 *
 * Usage examples :
 *   # Dry run on Sepolia (rehearsal planning)
 *   DRY_RUN=1 SAFE_ADDRESS=0x… npx hardhat run \
 *     scripts/multisig/transfer-ownership.ts --network celoSepolia
 *
 *   # Live rehearsal on Sepolia
 *   SAFE_ADDRESS=0x… npx hardhat run \
 *     scripts/multisig/transfer-ownership.ts --network celoSepolia
 *
 *   # MAINNET — irreversible
 *   MULTISIG_NETWORK=celoMainnet CONFIRM_MAINNET=1 SAFE_ADDRESS=0x… \
 *     npx hardhat run scripts/multisig/transfer-ownership.ts --network celoMainnet
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  getAddress,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";

// Per-network address overrides for contracts that aren't in the
// V1.3 deployment JSON because they weren't redeployed. EtaloCredits
// is the J7 deploy (still active per the CLAUDE.md key-addresses
// section). When mainnet is deployed, mainnet entry stays null and
// the JSON for that network must include EtaloCredits.
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

function fail(msg: string): never {
  console.error(`\n❌ FATAL: ${msg}\n`);
  process.exit(1);
}

async function main() {
  // ── Network resolution (hardhat 3 doesn't export HARDHAT_NETWORK ;
  // we take it from MULTISIG_NETWORK env, default celoSepolia for
  // rehearsal-by-default safety) ──────────────────────────────
  const network = process.env.MULTISIG_NETWORK ?? "celoSepolia";
  if (!(network in NETWORKS)) {
    fail(`MULTISIG_NETWORK must be one of: ${Object.keys(NETWORKS).join(", ")}. Got: "${network}".`);
  }
  const cfg = NETWORKS[network as keyof typeof NETWORKS];

  const dryRun = envFlag("DRY_RUN");
  const confirm = envFlag("CONFIRM_MAINNET");
  if (cfg.isMainnet && !confirm && !dryRun) {
    fail(`MAINNET execution requires CONFIRM_MAINNET=1 env. Prepend "CONFIRM_MAINNET=1" to the command to acknowledge the irreversible nature.`);
  }

  // ── Env ───────────────────────────────────────────────────
  const pk = process.env.PRIVATE_KEY;
  if (!pk) fail("PRIVATE_KEY missing from .env");
  const safeAddrRaw = process.env.SAFE_ADDRESS;
  if (!safeAddrRaw || !isAddress(safeAddrRaw)) {
    fail(`SAFE_ADDRESS missing or invalid in .env (got "${safeAddrRaw}"). Set it to the target Safe address.`);
  }
  const SAFE_ADDRESS = getAddress(safeAddrRaw);

  const deployer = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}` as `0x${string}`);

  // ── Chain client ──────────────────────────────────────────
  const chain = defineChain({
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpc] } },
    blockExplorers: { default: { name: "Explorer", url: cfg.explorer } },
    testnet: !cfg.isMainnet,
  });
  const transport = http(cfg.rpc);
  const pub = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account: deployer, chain, transport });

  // ── Deployment file ───────────────────────────────────────
  if (!fs.existsSync(cfg.deploymentFile)) {
    fail(`Deployment file ${cfg.deploymentFile} not found. (Did you run deploy.v2.ts for ${cfg.name} ?)`);
  }
  const dep = JSON.parse(fs.readFileSync(cfg.deploymentFile, "utf8"));
  const overrides = OVERRIDES[network as keyof typeof OVERRIDES] as Record<string, `0x${string}` | undefined>;

  // Resolve contract address from deployment JSON first, fall back
  // to OVERRIDES (used for contracts that weren't redeployed in this
  // bundle — e.g. EtaloCredits on Sepolia v1.3 is still the J7
  // deploy).
  const resolve = (name: string): `0x${string}` => {
    const fromJson = dep.contracts?.[name]?.address;
    if (fromJson) return getAddress(fromJson);
    const fromOverride = overrides[name];
    if (fromOverride) return getAddress(fromOverride);
    fail(`${name} not found in ${cfg.deploymentFile} and no override for ${network}.`);
  };

  // Contracts to rotate (Ownable transfer)
  const OWNABLE_CONTRACTS = [
    "EtaloReputation",
    "EtaloStake",
    "EtaloVoting",
    "EtaloDispute",
    "EtaloEscrow",
    "EtaloCredits",
  ] as const;

  const ESCROW = resolve("EtaloEscrow");

  console.log(`=== Multisig ownership rotation — ${cfg.name} ===`);
  console.log(`Mode      : ${dryRun ? "DRY RUN (no broadcast)" : "LIVE EXECUTION"}`);
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Safe addr : ${SAFE_ADDRESS}`);
  console.log(`Chain ID  : ${cfg.chainId}\n`);

  // ── Pre-flight checks ─────────────────────────────────────
  console.log(`--- Pre-flight ---`);

  // 1. Deployer has CELO for ~10 txs
  const balance = await pub.getBalance({ address: deployer.address });
  const minCelo = 200_000_000_000_000_000n; // 0.2 CELO
  console.log(`  Deployer balance : ${(Number(balance) / 1e18).toFixed(4)} CELO  (need ~0.2)`);
  if (balance < minCelo && !dryRun) {
    fail(`Deployer has insufficient CELO for ~9 admin txs. Need at least 0.2 CELO, has ${(Number(balance) / 1e18).toFixed(4)}.`);
  }

  // 2. Safe address has bytecode (i.e. it IS a contract, not a typo EOA)
  const safeCode = await pub.getCode({ address: SAFE_ADDRESS });
  if (!safeCode || safeCode === "0x") {
    if (cfg.isMainnet) {
      fail(`Safe address ${SAFE_ADDRESS} has NO bytecode on ${cfg.name}. Did you deploy the Safe ? Aborting mainnet run to prevent ownership loss.`);
    } else {
      console.log(`  ⚠️  Safe address has no bytecode on ${cfg.name} — would be FATAL on mainnet. Continuing on testnet for rehearsal purposes ONLY.`);
    }
  } else {
    console.log(`  ✅ Safe address has bytecode (${safeCode.length / 2 - 1} bytes) — looks like a deployed contract.`);
  }

  // 3. Read current owner of each contract; deployer must match
  console.log(`\n  Current owners (must all == deployer ${deployer.address}) :`);
  for (const c of OWNABLE_CONTRACTS) {
    const addr = resolve(c);
    const owner = (await pub.readContract({
      address: addr, abi: ownableAbi, functionName: "owner",
    })) as `0x${string}`;
    const isOwned = getAddress(owner) === deployer.address;
    const isAlreadySafe = getAddress(owner) === SAFE_ADDRESS;
    let marker = "  ";
    if (isAlreadySafe) marker = "🟡";
    else if (isOwned) marker = "✅";
    else marker = "❌";
    console.log(`    ${marker} ${c.padEnd(20)} owner = ${owner} ${isAlreadySafe ? "(already Safe — will SKIP)" : isOwned ? "" : "(NOT deployer — will FAIL)"}`);
    if (!isOwned && !isAlreadySafe) {
      fail(`${c} owner ${owner} is neither deployer nor Safe — refuse to proceed. Manually investigate before re-running.`);
    }
  }

  // 4. Current treasury values on Escrow
  console.log(`\n  Current treasuries on EtaloEscrow (will be reassigned to Safe) :`);
  const treasuryGetters = ["commissionTreasury", "creditsTreasury", "communityFund"] as const;
  for (const t of treasuryGetters) {
    const cur = (await pub.readContract({
      address: ESCROW, abi: escrowTreasuryAbi, functionName: t,
    })) as `0x${string}`;
    const isAlreadySafe = getAddress(cur) === SAFE_ADDRESS;
    console.log(`    ${isAlreadySafe ? "🟡" : "✅"} ${t.padEnd(20)} = ${cur} ${isAlreadySafe ? "(already Safe — will SKIP)" : ""}`);
  }

  // ── Plan ──────────────────────────────────────────────────
  //
  // ORDER CONSTRAINT (Sepolia rehearsal 2026-05-25 lesson learned):
  // the 3 EtaloEscrow treasury setters are `onlyOwner`, so they MUST
  // run BEFORE `EtaloEscrow.transferOwnership(Safe)`. Otherwise the
  // deployer loses owner status mid-batch and the treasury setters
  // revert with OwnableUnauthorizedAccount. Order below : 5 non-Escrow
  // contracts first (any order), then 3 treasury setters (Escrow
  // still owned by deployer), THEN EtaloEscrow.transferOwnership
  // last.
  console.log(`\n--- Plan (9 txs total) ---`);
  console.log(`  1. EtaloReputation.transferOwnership(Safe)`);
  console.log(`  2. EtaloStake.transferOwnership(Safe)`);
  console.log(`  3. EtaloVoting.transferOwnership(Safe)`);
  console.log(`  4. EtaloDispute.transferOwnership(Safe)`);
  console.log(`  5. EtaloCredits.transferOwnership(Safe)`);
  console.log(`  6. EtaloEscrow.setCommissionTreasury(Safe)`);
  console.log(`  7. EtaloEscrow.setCreditsTreasury(Safe)`);
  console.log(`  8. EtaloEscrow.setCommunityFund(Safe)`);
  console.log(`  9. EtaloEscrow.transferOwnership(Safe)  ← LAST so treasuries can be set above`);

  if (dryRun) {
    console.log(`\n✅ DRY RUN complete — no transactions broadcast. Re-run without DRY_RUN=1 to execute.`);
    if (cfg.isMainnet) console.log(`   For mainnet you must ALSO set CONFIRM_MAINNET=1.`);
    return;
  }

  // ── Execute ───────────────────────────────────────────────
  console.log(`\n--- Executing ${cfg.isMainnet ? "MAINNET" : "TESTNET"} transactions ---`);
  const txs: Array<{ step: string; hash: string; explorer: string }> = [];

  async function send(
    step: string,
    contractAddr: `0x${string}`,
    abi: typeof ownableAbi | typeof escrowTreasuryAbi,
    functionName: string,
    args: readonly [`0x${string}`]
  ) {
    console.log(`  [${step}] Sending ${functionName}(${args.join(", ")}) on ${contractAddr}…`);
    const hash = await wallet.writeContract({
      address: contractAddr, abi: abi as any, functionName, args,
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      fail(`${step} reverted (tx ${hash}). Aborting before subsequent steps to avoid partial state.`);
    }
    const explorer = `${cfg.explorer}/tx/${hash}`;
    console.log(`         ✅ ${explorer}`);
    txs.push({ step, hash, explorer });
  }

  // Phase 1 : transfer ownership of 5 non-Escrow contracts.
  const PHASE_1 = OWNABLE_CONTRACTS.filter((c) => c !== "EtaloEscrow");
  for (let i = 0; i < PHASE_1.length; i++) {
    const c = PHASE_1[i];
    const addr = resolve(c);
    const owner = (await pub.readContract({
      address: addr, abi: ownableAbi, functionName: "owner",
    })) as `0x${string}`;
    if (getAddress(owner) === SAFE_ADDRESS) {
      console.log(`  [${i + 1}] SKIP ${c}.transferOwnership — already owned by Safe`);
      continue;
    }
    await send(`${i + 1}`, addr, ownableAbi, "transferOwnership", [SAFE_ADDRESS]);
  }

  // Phase 2 : set the 3 treasuries on EtaloEscrow WHILE deployer is
  // still the owner. (`onlyOwner` modifier — must run before Phase 3.)
  const treasurySteps = [
    { name: "setCommissionTreasury", getter: "commissionTreasury" },
    { name: "setCreditsTreasury", getter: "creditsTreasury" },
    { name: "setCommunityFund", getter: "communityFund" },
  ] as const;
  for (let i = 0; i < treasurySteps.length; i++) {
    const s = treasurySteps[i];
    const cur = (await pub.readContract({
      address: ESCROW, abi: escrowTreasuryAbi, functionName: s.getter,
    })) as `0x${string}`;
    if (getAddress(cur) === SAFE_ADDRESS) {
      console.log(`  [${6 + i}] SKIP EtaloEscrow.${s.name} — already Safe`);
      continue;
    }
    await send(`${6 + i}`, ESCROW, escrowTreasuryAbi, s.name, [SAFE_ADDRESS]);
  }

  // Phase 3 : finally transfer EtaloEscrow ownership to the Safe.
  const escrowOwner = (await pub.readContract({
    address: ESCROW, abi: ownableAbi, functionName: "owner",
  })) as `0x${string}`;
  if (getAddress(escrowOwner) === SAFE_ADDRESS) {
    console.log(`  [9] SKIP EtaloEscrow.transferOwnership — already owned by Safe`);
  } else {
    await send(`9`, ESCROW, ownableAbi, "transferOwnership", [SAFE_ADDRESS]);
  }

  // ── Persist result ────────────────────────────────────────
  const result = {
    network: cfg.name,
    chainId: cfg.chainId,
    deployer: deployer.address,
    safe: SAFE_ADDRESS,
    executedAt: new Date().toISOString(),
    txs,
  };
  const outPath = path.join(
    "scripts", "multisig",
    `transfer-ownership-${network}-result.json`,
  );
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n✅ ${txs.length} tx(s) broadcast. Result saved to ${outPath}.`);
  console.log(`\n=== NEXT STEP ===`);
  console.log(`   Run verify-ownership.ts to confirm all 9 reads return the Safe :`);
  console.log(`   npx hardhat run scripts/multisig/verify-ownership.ts --network ${network}`);
  if (cfg.isMainnet) {
    console.log(`\n⚠️  MAINNET : also cross-check the Safe address on CeloScan UI :`);
    console.log(`   ${cfg.explorer}/address/${SAFE_ADDRESS}`);
    console.log(`   Confirm the Safe shows 3 owners + threshold 2.`);
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
