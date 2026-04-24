import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = process.env.CELO_SEPOLIA_RPC ?? "https://celo-sepolia.drpc.org";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: "CeloScan", url: "https://sepolia.celoscan.io" },
  },
  testnet: true,
});

const PARTIAL_PATH = path.join("deployments", "celo-sepolia-v2-partial.json");
const FINAL_PATH = path.join("deployments", "celo-sepolia-v2.json");

function loadArtifact(contractName: string) {
  const testPath = path.join("artifacts", "contracts", "test", `${contractName}.sol`, `${contractName}.json`);
  const mainPath = path.join("artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`);
  const filePath = fs.existsSync(testPath) ? testPath : mainPath;
  if (!fs.existsSync(filePath)) throw new Error(`Artifact missing: ${contractName}`);
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { abi: json.abi };
}

function requireEnvAddress(name: string): `0x${string}` {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing from .env`);
  if (!isAddress(v)) throw new Error(`${name} is not a valid address: ${v}`);
  return getAddress(v);
}

async function main() {
  // --- Load partial deployment state
  if (!fs.existsSync(PARTIAL_PATH)) throw new Error(`Partial state missing: ${PARTIAL_PATH}`);
  const partial = JSON.parse(fs.readFileSync(PARTIAL_PATH, "utf8"));

  const addrs = {
    mockUsdt: getAddress(partial.deployedContracts.MockUSDT.address),
    reputation: getAddress(partial.deployedContracts.EtaloReputation.address),
    stake: getAddress(partial.deployedContracts.EtaloStake.address),
    voting: getAddress(partial.deployedContracts.EtaloVoting.address),
    dispute: getAddress(partial.deployedContracts.EtaloDispute.address),
    escrow: getAddress(partial.deployedContracts.EtaloEscrow.address),
  };

  // --- Env
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set");
  const COMMISSION_TREASURY = requireEnvAddress("COMMISSION_TREASURY_ADDR");
  const CREDITS_TREASURY = requireEnvAddress("CREDITS_TREASURY_ADDR");
  const COMMUNITY_FUND = requireEnvAddress("COMMUNITY_FUND_ADDR");

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: celoSepolia, transport });
  const walletClient = createWalletClient({ account, chain: celoSepolia, transport });

  console.log("=== Resume Wiring — Celo Sepolia V2 ===");
  console.log(`Deployer: ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${Number(balance) / 1e18} CELO`);
  console.log(`\nContracts (from partial):`);
  for (const [k, v] of Object.entries(addrs)) console.log(`  ${k}: ${v}`);
  console.log("");

  // --- Load ABIs
  const reputationAbi = loadArtifact("EtaloReputation").abi;
  const stakeAbi = loadArtifact("EtaloStake").abi;
  const votingAbi = loadArtifact("EtaloVoting").abi;
  const disputeAbi = loadArtifact("EtaloDispute").abi;
  const escrowAbi = loadArtifact("EtaloEscrow").abi;
  const mockUsdtAbi = loadArtifact("MockUSDT").abi;

  // --- Helper: call a setter with legacy tx + receipt check
  async function writeTx(
    label: string,
    address: `0x${string}`,
    abi: any,
    functionName: string,
    args: unknown[],
  ): Promise<`0x${string}`> {
    const gasPrice = await publicClient.getGasPrice();
    const hash = await walletClient.writeContract({
      address, abi, functionName, args,
      type: "legacy" as any, gasPrice,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted (${hash})`);
    console.log(`  [OK]   ${label}  tx=${hash}`);
    return hash;
  }

  // --- Helper: read getter (returns normalized address/bool)
  async function readVar(
    address: `0x${string}`,
    abi: any,
    functionName: string,
    args: unknown[] = [],
  ) {
    return publicClient.readContract({ address, abi, functionName, args });
  }

  // ============================================================
  // Step A: Defensive-read + execute 10 remaining setters
  // ============================================================
  type Setter = {
    label: string;
    target: `0x${string}`;
    abi: any;
    setterFn: string;
    getterFn: string;
    getterArgs?: unknown[];
    expected: `0x${string}` | boolean;
  };

  const setters: Setter[] = [
    { label: "Dispute.setEscrow",            target: addrs.dispute, abi: disputeAbi, setterFn: "setEscrow",            getterFn: "escrow",            expected: addrs.escrow },
    { label: "Dispute.setStake",             target: addrs.dispute, abi: disputeAbi, setterFn: "setStake",             getterFn: "stake",             expected: addrs.stake },
    { label: "Dispute.setVoting",            target: addrs.dispute, abi: disputeAbi, setterFn: "setVoting",            getterFn: "voting",            expected: addrs.voting },
    { label: "Dispute.setReputation",        target: addrs.dispute, abi: disputeAbi, setterFn: "setReputation",        getterFn: "reputation",        expected: addrs.reputation },
    { label: "Escrow.setDisputeContract",    target: addrs.escrow,  abi: escrowAbi,  setterFn: "setDisputeContract",    getterFn: "dispute",           expected: addrs.dispute },
    { label: "Escrow.setStakeContract",      target: addrs.escrow,  abi: escrowAbi,  setterFn: "setStakeContract",      getterFn: "stake",             expected: addrs.stake },
    { label: "Escrow.setReputationContract", target: addrs.escrow,  abi: escrowAbi,  setterFn: "setReputationContract", getterFn: "reputation",        expected: addrs.reputation },
    { label: "Escrow.setCommissionTreasury", target: addrs.escrow,  abi: escrowAbi,  setterFn: "setCommissionTreasury", getterFn: "commissionTreasury", expected: COMMISSION_TREASURY },
    { label: "Escrow.setCreditsTreasury",    target: addrs.escrow,  abi: escrowAbi,  setterFn: "setCreditsTreasury",    getterFn: "creditsTreasury",    expected: CREDITS_TREASURY },
    { label: "Escrow.setCommunityFund",      target: addrs.escrow,  abi: escrowAbi,  setterFn: "setCommunityFund",      getterFn: "communityFund",      expected: COMMUNITY_FUND },
  ];

  console.log("=== Step A: Defensive-read + execute 10 remaining setters ===");
  const executedTxs: { label: string; txHash: `0x${string}` | null; skipped: boolean }[] = [];

  for (const s of setters) {
    const current = await readVar(s.target, s.abi, s.getterFn, s.getterArgs ?? []);
    const expectedStr = typeof s.expected === "boolean" ? String(s.expected) : getAddress(s.expected);
    const currentStr = typeof current === "string" && (current as string).startsWith("0x")
      ? getAddress(current as `0x${string}`)
      : String(current);

    if (currentStr === expectedStr) {
      console.log(`  [SKIP] ${s.label}  already set to ${currentStr}`);
      executedTxs.push({ label: s.label, txHash: null, skipped: true });
      continue;
    }

    const hash = await writeTx(s.label, s.target, s.abi, s.setterFn, [s.expected]);
    executedTxs.push({ label: s.label, txHash: hash, skipped: false });
  }

  // ============================================================
  // Step B: verifyWiring — 17 complete checks
  // ============================================================
  console.log("\n=== Step B: verifyWiring (17 complete checks) ===");

  type Check = { label: string; actual: unknown; expected: unknown };
  const checks: Check[] = [];

  checks.push({ label: "Reputation.isAuthorizedCaller(Escrow)",  actual: await readVar(addrs.reputation, reputationAbi, "isAuthorizedCaller", [addrs.escrow]),  expected: true });
  checks.push({ label: "Reputation.isAuthorizedCaller(Dispute)", actual: await readVar(addrs.reputation, reputationAbi, "isAuthorizedCaller", [addrs.dispute]), expected: true });

  checks.push({ label: "Stake.reputation",       actual: await readVar(addrs.stake, stakeAbi, "reputation"),       expected: addrs.reputation });
  checks.push({ label: "Stake.disputeContract",  actual: await readVar(addrs.stake, stakeAbi, "disputeContract"),  expected: addrs.dispute });
  checks.push({ label: "Stake.escrowContract",   actual: await readVar(addrs.stake, stakeAbi, "escrowContract"),   expected: addrs.escrow });
  checks.push({ label: "Stake.communityFund",    actual: await readVar(addrs.stake, stakeAbi, "communityFund"),    expected: COMMUNITY_FUND });

  checks.push({ label: "Voting.disputeContract", actual: await readVar(addrs.voting, votingAbi, "disputeContract"), expected: addrs.dispute });

  checks.push({ label: "Dispute.escrow",     actual: await readVar(addrs.dispute, disputeAbi, "escrow"),     expected: addrs.escrow });
  checks.push({ label: "Dispute.stake",      actual: await readVar(addrs.dispute, disputeAbi, "stake"),      expected: addrs.stake });
  checks.push({ label: "Dispute.voting",     actual: await readVar(addrs.dispute, disputeAbi, "voting"),     expected: addrs.voting });
  checks.push({ label: "Dispute.reputation", actual: await readVar(addrs.dispute, disputeAbi, "reputation"), expected: addrs.reputation });

  checks.push({ label: "Escrow.dispute",            actual: await readVar(addrs.escrow, escrowAbi, "dispute"),            expected: addrs.dispute });
  checks.push({ label: "Escrow.stake",              actual: await readVar(addrs.escrow, escrowAbi, "stake"),              expected: addrs.stake });
  checks.push({ label: "Escrow.reputation",         actual: await readVar(addrs.escrow, escrowAbi, "reputation"),         expected: addrs.reputation });
  checks.push({ label: "Escrow.commissionTreasury", actual: await readVar(addrs.escrow, escrowAbi, "commissionTreasury"), expected: COMMISSION_TREASURY });
  checks.push({ label: "Escrow.creditsTreasury",    actual: await readVar(addrs.escrow, escrowAbi, "creditsTreasury"),    expected: CREDITS_TREASURY });
  checks.push({ label: "Escrow.communityFund",      actual: await readVar(addrs.escrow, escrowAbi, "communityFund"),      expected: COMMUNITY_FUND });

  const mismatches: string[] = [];
  for (const { label, actual, expected } of checks) {
    const act = typeof actual === "string" && (actual as string).startsWith("0x") ? getAddress(actual as `0x${string}`) : String(actual);
    const exp = typeof expected === "string" && (expected as string).startsWith("0x") ? getAddress(expected as `0x${string}`) : String(expected);
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
  // Step C: Mint 10k MockUSDT to deployer
  // ============================================================
  console.log("\n=== Step C: Mint 10,000 MockUSDT to deployer ===");
  const mintAmount = 10_000n * 1_000_000n;
  const mintTxHash = await writeTx(
    `MockUSDT.mint(${account.address}, 10000 USDT)`,
    addrs.mockUsdt,
    mockUsdtAbi,
    "mint",
    [account.address, mintAmount],
  );
  const usdtBalance = (await readVar(addrs.mockUsdt, mockUsdtAbi, "balanceOf", [account.address])) as bigint;
  console.log(`  Deployer USDT balance: ${Number(usdtBalance) / 1e6} USDT`);

  // ============================================================
  // Step D: Assemble final deployments/celo-sepolia-v2.json
  // ============================================================
  const priorCompleted: any[] = partial.completedSetters ?? [];
  const newCompleted = executedTxs.map((t) => ({
    name: t.label,
    txHash: t.txHash,
    ...(t.skipped ? { note: "defensive-read skip — already set on-chain" } : {}),
  }));
  const allSetters = [...priorCompleted, ...newCompleted];

  const finalData = {
    network: "celoSepolia",
    chainId: 11142220,
    deployer: account.address,
    treasuries: {
      commission: COMMISSION_TREASURY,
      credits: CREDITS_TREASURY,
      community: COMMUNITY_FUND,
    },
    contracts: {
      MockUSDT: partial.deployedContracts.MockUSDT,
      EtaloReputation: partial.deployedContracts.EtaloReputation,
      EtaloStake: partial.deployedContracts.EtaloStake,
      EtaloVoting: partial.deployedContracts.EtaloVoting,
      EtaloDispute: partial.deployedContracts.EtaloDispute,
      EtaloEscrow: partial.deployedContracts.EtaloEscrow,
    },
    setters: allSetters,
    mint: {
      contract: "MockUSDT",
      recipient: account.address,
      amount: "10000 USDT (10_000_000_000 raw, 6 decimals)",
      txHash: mintTxHash,
      finalBalance: `${Number(usdtBalance) / 1e6} USDT`,
    },
    deployedAt: partial.timestamp,
    wiringCompletedAt: new Date().toISOString(),
  };

  fs.writeFileSync(FINAL_PATH, JSON.stringify(finalData, null, 2));
  console.log(`\nSaved: ${FINAL_PATH}`);

  // --- Remove partial (cleanup)
  fs.unlinkSync(PARTIAL_PATH);
  console.log(`Removed: ${PARTIAL_PATH}`);

  console.log("\n=== Resume Complete ===");
  console.log(JSON.stringify(finalData, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  console.error(e);
  process.exitCode = 1;
});
