/**
 * scripts/deploy.mainnet.ts — Etalo V2 + Credits deploy to Celo
 * mainnet (chainId 42220). Production version of `deploy.v2.ts` +
 * `deploy-credits.ts` combined into one script.
 *
 * Critical differences vs deploy.v2.ts :
 *   - Uses REAL USDT on Celo mainnet (0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e)
 *     instead of deploying MockUSDT
 *   - Deploys EtaloCredits in the same flow (no separate
 *     deploy-credits.ts run needed)
 *   - Writes to deployments/celo-mainnet-v2.json
 *   - No 10K MockUSDT mint to deployer (no MockUSDT)
 *   - Refuses to run on Sepolia (CHAIN_ID guard)
 *
 * Env required :
 *   PRIVATE_KEY                deployer (must have ≥ 0.5 CELO mainnet)
 *   COMMISSION_TREASURY_ADDR   ADR-024 separation, V1 = deployer address temporarily
 *   CREDITS_TREASURY_ADDR      ADR-024 separation, V1 = deployer address temporarily
 *   COMMUNITY_FUND_ADDR        ADR-024 separation, V1 = deployer address temporarily
 *   CELO_MAINNET_RPC           optional, defaults to forno
 *   CONFIRM_MAINNET=1          REQUIRED — explicit mainnet acknowledgement
 *
 * Note on treasuries : ADR-024 wants 3 separate wallets. For V1
 * ship-now with shadow-Mike multisig, the deployer address can fill
 * all 3 slots and they get rotated to the Safe via
 * transfer-ownership.ts immediately after. Documented in ADR-055
 * third update §1.3.
 *
 * Usage :
 *   CONFIRM_MAINNET=1 npx hardhat run scripts/deploy.mainnet.ts \
 *     --network celoMainnet
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

const RPC_URL = process.env.CELO_MAINNET_RPC ?? "https://forno.celo.org";

// Real USDT on Celo mainnet (Tether USD, 6 decimals)
const REAL_USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as `0x${string}`;

const celoMainnet = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "CeloScan", url: "https://celoscan.io" } },
  testnet: false,
});

function loadArtifact(contractName: string) {
  const testPath = path.join(
    "artifacts", "contracts", "test", `${contractName}.sol`, `${contractName}.json`,
  );
  const mainPath = path.join(
    "artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`,
  );
  const filePath = fs.existsSync(testPath) ? testPath : mainPath;
  if (!fs.existsSync(filePath)) {
    throw new Error(`Artifact not found for ${contractName} at ${filePath}. Run: npx hardhat compile`);
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

async function main() {
  // ── Mainnet safety guards ─────────────────────────────────
  if (process.env.CONFIRM_MAINNET !== "1") {
    throw new Error(
      "MAINNET DEPLOY requires CONFIRM_MAINNET=1 env var. " +
      "Prepend `CONFIRM_MAINNET=1` to acknowledge real-USDT contracts on Celo mainnet.",
    );
  }

  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");

  const COMMISSION_TREASURY = requireEnvAddress("COMMISSION_TREASURY_ADDR");
  const CREDITS_TREASURY = requireEnvAddress("CREDITS_TREASURY_ADDR");
  const COMMUNITY_FUND = requireEnvAddress("COMMUNITY_FUND_ADDR");

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: celoMainnet, transport });
  const walletClient = createWalletClient({ account, chain: celoMainnet, transport });

  // Verify chain id
  const onChainChainId = await publicClient.getChainId();
  if (onChainChainId !== 42220) {
    throw new Error(`Expected Celo mainnet (42220), got chainId ${onChainChainId}. Wrong RPC ?`);
  }

  console.log("=== Etalo V2 + Credits Deployment — Celo MAINNET ===");
  console.log(`⚠️  PRODUCTION DEPLOY — real USDT, real users will trust this`);
  console.log(`Deployer            : ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address });
  const balanceCelo = Number(balance) / 1e18;
  console.log(`Balance             : ${balanceCelo.toFixed(4)} CELO`);
  if (balanceCelo < 0.5) {
    throw new Error(
      `Deployer balance ${balanceCelo.toFixed(4)} CELO < 0.5 CELO minimum. ` +
      `Fund the deployer first.`,
    );
  }
  console.log(`Chain ID            : ${onChainChainId} (Celo mainnet ✓)`);
  console.log(`USDT (real)         : ${REAL_USDT}`);
  console.log(`Commission treasury : ${COMMISSION_TREASURY}`);
  console.log(`Credits treasury    : ${CREDITS_TREASURY}`);
  console.log(`Community fund      : ${COMMUNITY_FUND}`);
  console.log("");

  // ── Helpers ──────────────────────────────────────────────
  async function deploy(name: string, args: unknown[] = []) {
    console.log(`\nDeploying ${name}...`);
    const { abi, bytecode } = loadArtifact(name);
    const data = encodeDeployData({ abi, bytecode, args });
    const gasPrice = await publicClient.getGasPrice();
    const gas = await publicClient.estimateGas({ account: account.address, data });
    console.log(`  gas: ${gas}, gasPrice: ${gasPrice}`);
    const hash = await walletClient.sendTransaction({
      data, type: "legacy" as any, gasPrice, gas: (gas * 120n) / 100n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const address = receipt.contractAddress!;
    console.log(`  ${name}: ${address} (block ${receipt.blockNumber})`);
    return { address: getAddress(address), abi, txHash: hash, blockNumber: receipt.blockNumber };
  }

  async function call(
    label: string,
    address: `0x${string}`,
    abi: any,
    functionName: string,
    args: unknown[],
  ) {
    const gasPrice = await publicClient.getGasPrice();
    const hash = await walletClient.writeContract({
      address, abi, functionName, args, type: "legacy" as any, gasPrice,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const status = receipt.status === "success" ? "OK" : "FAIL";
    console.log(`  [${status}] ${label}  (${hash})`);
    if (receipt.status !== "success") throw new Error(`Setter ${label} reverted`);
    return hash;
  }

  // ============================================================
  // Step 1: Deploy 5 V2 core contracts + EtaloCredits
  //   (no MockUSDT — use real USDT)
  // ============================================================
  const reputation = await deploy("EtaloReputation");
  const stake = await deploy("EtaloStake", [REAL_USDT]);
  const voting = await deploy("EtaloVoting");
  const dispute = await deploy("EtaloDispute");
  const escrow = await deploy("EtaloEscrow", [REAL_USDT]);
  const credits = await deploy("EtaloCredits", [
    REAL_USDT, CREDITS_TREASURY, account.address,
  ]);

  // ============================================================
  // Step 2: Wire 17 inter-contract setters (same as Sepolia)
  // ============================================================
  console.log("\n=== Wiring inter-contract references (17 setters) ===");

  await call("Reputation.setAuthorizedCaller(Escrow)",  reputation.address, reputation.abi, "setAuthorizedCaller", [escrow.address, true]);
  await call("Reputation.setAuthorizedCaller(Dispute)", reputation.address, reputation.abi, "setAuthorizedCaller", [dispute.address, true]);

  await call("Stake.setReputationContract", stake.address, stake.abi, "setReputationContract", [reputation.address]);
  await call("Stake.setDisputeContract",    stake.address, stake.abi, "setDisputeContract",    [dispute.address]);
  await call("Stake.setEscrowContract",     stake.address, stake.abi, "setEscrowContract",     [escrow.address]);
  await call("Stake.setCommunityFund",      stake.address, stake.abi, "setCommunityFund",      [COMMUNITY_FUND]);

  await call("Voting.setDisputeContract", voting.address, voting.abi, "setDisputeContract", [dispute.address]);

  await call("Dispute.setEscrow",     dispute.address, dispute.abi, "setEscrow",     [escrow.address]);
  await call("Dispute.setStake",      dispute.address, dispute.abi, "setStake",      [stake.address]);
  await call("Dispute.setVoting",     dispute.address, dispute.abi, "setVoting",     [voting.address]);
  await call("Dispute.setReputation", dispute.address, dispute.abi, "setReputation", [reputation.address]);

  await call("Escrow.setDisputeContract",    escrow.address, escrow.abi, "setDisputeContract",    [dispute.address]);
  await call("Escrow.setStakeContract",      escrow.address, escrow.abi, "setStakeContract",      [stake.address]);
  await call("Escrow.setReputationContract", escrow.address, escrow.abi, "setReputationContract", [reputation.address]);
  await call("Escrow.setCommissionTreasury", escrow.address, escrow.abi, "setCommissionTreasury", [COMMISSION_TREASURY]);
  await call("Escrow.setCreditsTreasury",    escrow.address, escrow.abi, "setCreditsTreasury",    [CREDITS_TREASURY]);
  await call("Escrow.setCommunityFund",      escrow.address, escrow.abi, "setCommunityFund",      [COMMUNITY_FUND]);

  // ============================================================
  // Step 3: Verify wiring (17 reads)
  // ============================================================
  console.log("\n=== Verifying wiring (17 on-chain reads) ===");

  type Check = { label: string; actual: unknown; expected: unknown };
  async function readVar(address: `0x${string}`, abi: any, fn: string, args: unknown[] = []) {
    return publicClient.readContract({ address, abi, functionName: fn, args });
  }
  const checks: Check[] = [];

  checks.push({ label: "Reputation.isAuthorizedCaller(Escrow)",  actual: await readVar(reputation.address, reputation.abi, "isAuthorizedCaller", [escrow.address]),  expected: true });
  checks.push({ label: "Reputation.isAuthorizedCaller(Dispute)", actual: await readVar(reputation.address, reputation.abi, "isAuthorizedCaller", [dispute.address]), expected: true });

  checks.push({ label: "Stake.reputation",      actual: await readVar(stake.address, stake.abi, "reputation"),      expected: reputation.address });
  checks.push({ label: "Stake.disputeContract", actual: await readVar(stake.address, stake.abi, "disputeContract"), expected: dispute.address });
  checks.push({ label: "Stake.escrowContract",  actual: await readVar(stake.address, stake.abi, "escrowContract"),  expected: escrow.address });
  checks.push({ label: "Stake.communityFund",   actual: await readVar(stake.address, stake.abi, "communityFund"),   expected: COMMUNITY_FUND });

  checks.push({ label: "Voting.disputeContract", actual: await readVar(voting.address, voting.abi, "disputeContract"), expected: dispute.address });

  checks.push({ label: "Dispute.escrow",     actual: await readVar(dispute.address, dispute.abi, "escrow"),     expected: escrow.address });
  checks.push({ label: "Dispute.stake",      actual: await readVar(dispute.address, dispute.abi, "stake"),      expected: stake.address });
  checks.push({ label: "Dispute.voting",     actual: await readVar(dispute.address, dispute.abi, "voting"),     expected: voting.address });
  checks.push({ label: "Dispute.reputation", actual: await readVar(dispute.address, dispute.abi, "reputation"), expected: reputation.address });

  checks.push({ label: "Escrow.dispute",            actual: await readVar(escrow.address, escrow.abi, "dispute"),            expected: dispute.address });
  checks.push({ label: "Escrow.stake",              actual: await readVar(escrow.address, escrow.abi, "stake"),              expected: stake.address });
  checks.push({ label: "Escrow.reputation",         actual: await readVar(escrow.address, escrow.abi, "reputation"),         expected: reputation.address });
  checks.push({ label: "Escrow.commissionTreasury", actual: await readVar(escrow.address, escrow.abi, "commissionTreasury"), expected: COMMISSION_TREASURY });
  checks.push({ label: "Escrow.creditsTreasury",    actual: await readVar(escrow.address, escrow.abi, "creditsTreasury"),    expected: CREDITS_TREASURY });
  checks.push({ label: "Escrow.communityFund",      actual: await readVar(escrow.address, escrow.abi, "communityFund"),      expected: COMMUNITY_FUND });

  const mismatches: string[] = [];
  for (const { label, actual, expected } of checks) {
    const act = typeof actual === "string" && actual.startsWith("0x") ? getAddress(actual as `0x${string}`) : String(actual);
    const exp = typeof expected === "string" && expected.startsWith("0x") ? getAddress(expected as `0x${string}`) : String(expected);
    if (act === exp) {
      console.log(`  [OK] ${label}  = ${act}`);
    } else {
      const msg = `[MISMATCH] ${label}  expected ${exp}, got ${act}`;
      console.log(`  ${msg}`);
      mismatches.push(msg);
    }
  }
  if (mismatches.length) {
    throw new Error(`verifyWiring failed (${mismatches.length} mismatches):\n  ${mismatches.join("\n  ")}`);
  }
  console.log(`\n  All ${checks.length} wiring checks passed.`);

  // ============================================================
  // Step 4: Verify EtaloCredits constructor wiring
  // ============================================================
  console.log("\n=== Verifying EtaloCredits constructor wiring ===");
  const creditsUsdt = (await publicClient.readContract({
    address: credits.address, abi: credits.abi, functionName: "usdt",
  })) as `0x${string}`;
  const creditsTreasury = (await publicClient.readContract({
    address: credits.address, abi: credits.abi, functionName: "creditsTreasury",
  })) as `0x${string}`;
  if (getAddress(creditsUsdt) !== REAL_USDT) throw new Error(`Credits.usdt mismatch`);
  if (getAddress(creditsTreasury) !== CREDITS_TREASURY) throw new Error(`Credits.creditsTreasury mismatch`);
  console.log(`  [OK] Credits.usdt            = ${creditsUsdt}`);
  console.log(`  [OK] Credits.creditsTreasury = ${creditsTreasury}`);

  // ============================================================
  // Step 5: Save deployments JSON
  // ============================================================
  console.log("\n=== Deployment Complete ===");
  const result = {
    network: "celoMainnet",
    chainId: 42220,
    deployer: account.address,
    realUsdt: REAL_USDT,
    treasuries: {
      commission: COMMISSION_TREASURY,
      credits: CREDITS_TREASURY,
      community: COMMUNITY_FUND,
    },
    contracts: {
      EtaloReputation: { address: reputation.address, txHash: reputation.txHash, block: reputation.blockNumber.toString() },
      EtaloStake:      { address: stake.address,      txHash: stake.txHash,      block: stake.blockNumber.toString(), constructorArgs: [REAL_USDT] },
      EtaloVoting:     { address: voting.address,     txHash: voting.txHash,     block: voting.blockNumber.toString() },
      EtaloDispute:    { address: dispute.address,    txHash: dispute.txHash,    block: dispute.blockNumber.toString() },
      EtaloEscrow:     { address: escrow.address,     txHash: escrow.txHash,     block: escrow.blockNumber.toString(), constructorArgs: [REAL_USDT] },
      EtaloCredits:    { address: credits.address,    txHash: credits.txHash,    block: credits.blockNumber.toString(), constructorArgs: [REAL_USDT, CREDITS_TREASURY, account.address] },
    },
    deployedAt: new Date().toISOString(),
    tag: "v1.4-mainnet",
    adr: "ADR-054 (audit fixes) + ADR-055 third update (shadow Mike multisig)",
  };
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync("deployments/celo-mainnet-v2.json", JSON.stringify(result, null, 2));
  console.log("Saved : deployments/celo-mainnet-v2.json");
  console.log(JSON.stringify(result, null, 2));
  console.log("\n=== NEXT STEPS ===");
  console.log("1. Verify contracts on Blockscout + Sourcify :");
  console.log("   for each address, run :");
  console.log("     npx hardhat verify --network celoMainnet <address> [constructor args]");
  console.log("2. Create the mainnet Safe (programmatic or via Safe Wallet UI).");
  console.log("3. Run scripts/multisig/transfer-ownership.ts to rotate ownership.");
}

main().catch((e) => {
  console.error("\nFATAL:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
