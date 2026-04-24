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

// Celo Sepolia — use drpc.org (feedback_celo_deploy.md)
const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://celo-sepolia.drpc.org"] } },
  blockExplorers: {
    default: { name: "CeloScan", url: "https://sepolia.celoscan.io" },
  },
  testnet: true,
});

function loadArtifact(contractName: string) {
  const testPath = path.join(
    "artifacts",
    "contracts",
    "test",
    `${contractName}.sol`,
    `${contractName}.json`,
  );
  const mainPath = path.join(
    "artifacts",
    "contracts",
    `${contractName}.sol`,
    `${contractName}.json`,
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
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");

  const COMMISSION_TREASURY = requireEnvAddress("COMMISSION_TREASURY_ADDR");
  const CREDITS_TREASURY = requireEnvAddress("CREDITS_TREASURY_ADDR");
  const COMMUNITY_FUND = requireEnvAddress("COMMUNITY_FUND_ADDR");

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http("https://celo-sepolia.drpc.org");

  const publicClient = createPublicClient({ chain: celoSepolia, transport });
  const walletClient = createWalletClient({ account, chain: celoSepolia, transport });

  console.log("=== Etalo V2 Deployment — Celo Sepolia ===");
  console.log(`Deployer: ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${Number(balance) / 1e18} CELO`);
  console.log(`Chain ID: ${await publicClient.getChainId()}`);
  console.log(`Commission treasury: ${COMMISSION_TREASURY}`);
  console.log(`Credits treasury:    ${CREDITS_TREASURY}`);
  console.log(`Community fund:      ${COMMUNITY_FUND}`);
  console.log("");

  async function deploy(name: string, args: unknown[] = []) {
    console.log(`\nDeploying ${name}...`);
    const { abi, bytecode } = loadArtifact(name);
    const data = encodeDeployData({ abi, bytecode, args });

    // Legacy tx (type 0) — Celo Sepolia rejects EIP-1559 params
    const gasPrice = await publicClient.getGasPrice();
    const gas = await publicClient.estimateGas({ account: account.address, data });
    console.log(`  gas: ${gas}, gasPrice: ${gasPrice}`);

    const hash = await walletClient.sendTransaction({
      data,
      type: "legacy" as any,
      gasPrice,
      gas: (gas * 120n) / 100n,
    });
    console.log(`  tx: ${hash}`);

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
      address,
      abi,
      functionName,
      args,
      type: "legacy" as any,
      gasPrice,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const status = receipt.status === "success" ? "OK" : "FAIL";
    console.log(`  [${status}] ${label}  (${hash})`);
    if (receipt.status !== "success") throw new Error(`Setter ${label} reverted`);
    return hash;
  }

  // ============================================================
  // Step 1: Deploy MockUSDT v2 (fresh — no V1 contamination)
  // ============================================================
  const mockUsdt = await deploy("MockUSDT");

  // ============================================================
  // Step 2: Deploy 5 V2 core contracts
  // ============================================================
  const reputation = await deploy("EtaloReputation");
  const stake = await deploy("EtaloStake", [mockUsdt.address]);
  const voting = await deploy("EtaloVoting");
  const dispute = await deploy("EtaloDispute");
  const escrow = await deploy("EtaloEscrow", [mockUsdt.address]);

  // ============================================================
  // Step 3: Wire 17 inter-contract setters
  // ============================================================
  console.log("\n=== Wiring inter-contract references (17 setters) ===");

  // --- Reputation: authorize Escrow + Dispute (Stake reads only, no auth needed)
  await call("Reputation.setAuthorizedCaller(Escrow)", reputation.address, reputation.abi, "setAuthorizedCaller", [escrow.address, true]);
  await call("Reputation.setAuthorizedCaller(Dispute)", reputation.address, reputation.abi, "setAuthorizedCaller", [dispute.address, true]);

  // --- Stake: wire Reputation, Dispute, Escrow, CommunityFund
  await call("Stake.setReputationContract", stake.address, stake.abi, "setReputationContract", [reputation.address]);
  await call("Stake.setDisputeContract", stake.address, stake.abi, "setDisputeContract", [dispute.address]);
  await call("Stake.setEscrowContract", stake.address, stake.abi, "setEscrowContract", [escrow.address]);
  await call("Stake.setCommunityFund", stake.address, stake.abi, "setCommunityFund", [COMMUNITY_FUND]);

  // --- Voting: wire Dispute
  await call("Voting.setDisputeContract", voting.address, voting.abi, "setDisputeContract", [dispute.address]);

  // --- Dispute: wire Escrow, Stake, Voting, Reputation
  await call("Dispute.setEscrow", dispute.address, dispute.abi, "setEscrow", [escrow.address]);
  await call("Dispute.setStake", dispute.address, dispute.abi, "setStake", [stake.address]);
  await call("Dispute.setVoting", dispute.address, dispute.abi, "setVoting", [voting.address]);
  await call("Dispute.setReputation", dispute.address, dispute.abi, "setReputation", [reputation.address]);

  // --- Escrow: wire Dispute, Stake, Reputation + 3 treasuries (ADR-024)
  await call("Escrow.setDisputeContract", escrow.address, escrow.abi, "setDisputeContract", [dispute.address]);
  await call("Escrow.setStakeContract", escrow.address, escrow.abi, "setStakeContract", [stake.address]);
  await call("Escrow.setReputationContract", escrow.address, escrow.abi, "setReputationContract", [reputation.address]);
  await call("Escrow.setCommissionTreasury", escrow.address, escrow.abi, "setCommissionTreasury", [COMMISSION_TREASURY]);
  await call("Escrow.setCreditsTreasury", escrow.address, escrow.abi, "setCreditsTreasury", [CREDITS_TREASURY]);
  await call("Escrow.setCommunityFund", escrow.address, escrow.abi, "setCommunityFund", [COMMUNITY_FUND]);

  // ============================================================
  // Step 4: Verify wiring — read each getter, assert expected value
  // ============================================================
  console.log("\n=== Verifying wiring (17 on-chain reads) ===");

  type Check = { label: string; actual: unknown; expected: unknown };

  async function readVar(
    address: `0x${string}`,
    abi: any,
    functionName: string,
    args: unknown[] = [],
  ) {
    return publicClient.readContract({ address, abi, functionName, args });
  }

  const checks: Check[] = [];

  // Reputation auth (mapping getter: isAuthorizedCaller, NOT isAuthorized)
  checks.push({
    label: "Reputation.isAuthorizedCaller(Escrow)",
    actual: await readVar(reputation.address, reputation.abi, "isAuthorizedCaller", [escrow.address]),
    expected: true,
  });
  checks.push({
    label: "Reputation.isAuthorizedCaller(Dispute)",
    actual: await readVar(reputation.address, reputation.abi, "isAuthorizedCaller", [dispute.address]),
    expected: true,
  });

  // Stake
  checks.push({ label: "Stake.reputation",       actual: await readVar(stake.address, stake.abi, "reputation"),       expected: reputation.address });
  checks.push({ label: "Stake.disputeContract",  actual: await readVar(stake.address, stake.abi, "disputeContract"),  expected: dispute.address });
  checks.push({ label: "Stake.escrowContract",   actual: await readVar(stake.address, stake.abi, "escrowContract"),   expected: escrow.address });
  checks.push({ label: "Stake.communityFund",    actual: await readVar(stake.address, stake.abi, "communityFund"),    expected: COMMUNITY_FUND });

  // Voting
  checks.push({ label: "Voting.disputeContract", actual: await readVar(voting.address, voting.abi, "disputeContract"), expected: dispute.address });

  // Dispute
  checks.push({ label: "Dispute.escrow",     actual: await readVar(dispute.address, dispute.abi, "escrow"),     expected: escrow.address });
  checks.push({ label: "Dispute.stake",      actual: await readVar(dispute.address, dispute.abi, "stake"),      expected: stake.address });
  checks.push({ label: "Dispute.voting",     actual: await readVar(dispute.address, dispute.abi, "voting"),     expected: voting.address });
  checks.push({ label: "Dispute.reputation", actual: await readVar(dispute.address, dispute.abi, "reputation"), expected: reputation.address });

  // Escrow (public vars are named `dispute`, `stake`, `reputation` — not *Contract)
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
  // Step 5: Mint 10,000 MockUSDT to deployer (testing convenience)
  // ============================================================
  console.log("\n=== Minting 10,000 MockUSDT to deployer ===");
  const mockUsdtAbi = loadArtifact("MockUSDT").abi;
  const mintAmount = 10_000n * 1_000_000n; // 10k USDT × 1e6 decimals
  await call(
    `MockUSDT.mint(${account.address}, 10000 USDT)`,
    mockUsdt.address,
    mockUsdtAbi,
    "mint",
    [account.address, mintAmount],
  );
  const usdtBalance = (await publicClient.readContract({
    address: mockUsdt.address,
    abi: mockUsdtAbi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  console.log(`  Deployer USDT balance: ${Number(usdtBalance) / 1e6} USDT`);

  // ============================================================
  // Step 6: Save deployment artifact
  // ============================================================
  const deploymentData = {
    network: "celoSepolia",
    chainId: 11142220,
    deployer: account.address,
    treasuries: {
      commission: COMMISSION_TREASURY,
      credits: CREDITS_TREASURY,
      community: COMMUNITY_FUND,
    },
    contracts: {
      MockUSDT: { address: mockUsdt.address, txHash: mockUsdt.txHash, block: mockUsdt.blockNumber.toString() },
      EtaloReputation: { address: reputation.address, txHash: reputation.txHash, block: reputation.blockNumber.toString() },
      EtaloStake: { address: stake.address, txHash: stake.txHash, block: stake.blockNumber.toString(), constructorArgs: [mockUsdt.address] },
      EtaloVoting: { address: voting.address, txHash: voting.txHash, block: voting.blockNumber.toString() },
      EtaloDispute: { address: dispute.address, txHash: dispute.txHash, block: dispute.blockNumber.toString() },
      EtaloEscrow: { address: escrow.address, txHash: escrow.txHash, block: escrow.blockNumber.toString(), constructorArgs: [mockUsdt.address] },
    },
    deployedAt: new Date().toISOString(),
  };

  const deploymentsDir = path.join("deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  const outPath = path.join(deploymentsDir, "celo-sepolia-v2.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2));

  console.log("\n=== Deployment Complete ===");
  console.log(`Saved: ${outPath}`);
  console.log(JSON.stringify(deploymentData, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  console.error(e);
  process.exitCode = 1;
});
