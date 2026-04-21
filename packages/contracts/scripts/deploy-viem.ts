import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  encodeDeployData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://celo-sepolia.drpc.org"] },
  },
  blockExplorers: {
    default: { name: "CeloScan", url: "https://sepolia.celoscan.io" },
  },
  testnet: true,
});

function loadArtifact(contractName: string) {
  // Check test/ subdirectory first
  const testPath = path.join("artifacts", "contracts", "test", `${contractName}.sol`, `${contractName}.json`);
  const mainPath = path.join("artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`);
  const filePath = fs.existsSync(testPath) ? testPath : mainPath;
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { abi: json.abi, bytecode: json.bytecode as `0x${string}` };
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http("https://celo-sepolia.drpc.org");

  const publicClient = createPublicClient({ chain: celoSepolia, transport });
  const walletClient = createWalletClient({ account, chain: celoSepolia, transport });

  console.log("=== Etalo Deployment ===");
  console.log(`Deployer: ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${Number(balance) / 1e18} CELO`);
  console.log(`Chain ID: ${await publicClient.getChainId()}`);
  console.log("");

  const ALREADY = {
    MockUSDT: "0x4212d248fc28c7aa0ae0e5982051b5e9d2a12dc6" as `0x${string}`,
    EtaloReputation: "0xc9d3f823a4c985bd126899573864dba4a6601ef4" as `0x${string}`,
  };

  // Check if already deployed contracts still exist
  const code1 = await publicClient.getCode({ address: ALREADY.MockUSDT });
  const code2 = await publicClient.getCode({ address: ALREADY.EtaloReputation });
  console.log(`MockUSDT (existing): ${ALREADY.MockUSDT} ${code1 && code1 !== "0x" ? "OK" : "NOT FOUND"}`);
  console.log(`EtaloReputation (existing): ${ALREADY.EtaloReputation} ${code2 && code2 !== "0x" ? "OK" : "NOT FOUND"}`);

  async function deploy(name: string, args: any[] = []) {
    console.log(`\nDeploying ${name}...`);
    const { abi, bytecode } = loadArtifact(name);

    const data = encodeDeployData({ abi, bytecode, args });

    // Use legacy tx (type 0) — Celo Sepolia RPC rejects EIP-1559 params
    const gasPrice = await publicClient.getGasPrice();
    const gas = await publicClient.estimateGas({
      account: account.address,
      data,
    });
    console.log(`  gas: ${gas}, gasPrice: ${gasPrice}`);

    const hash = await walletClient.sendTransaction({
      data,
      type: "legacy" as any,
      gasPrice,
      gas: gas * 120n / 100n, // 20% buffer
    });
    console.log(`  tx: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const address = receipt.contractAddress!;
    console.log(`  ${name}: ${address} (block ${receipt.blockNumber})`);
    return { address, abi };
  }

  // Deploy EtaloEscrow
  const escrow = await deploy("EtaloEscrow", [
    ALREADY.MockUSDT,
    account.address, // treasury = deployer on testnet
    ALREADY.EtaloReputation,
  ]);

  // Deploy EtaloDispute
  const dispute = await deploy("EtaloDispute", [
    escrow.address,
    ALREADY.EtaloReputation,
  ]);

  // Link contracts (legacy tx type)
  console.log("\nLinking contracts...");
  const gasPrice = await publicClient.getGasPrice();

  const hash1 = await walletClient.writeContract({
    address: escrow.address,
    abi: escrow.abi,
    functionName: "setDisputeContract",
    args: [dispute.address],
    type: "legacy" as any,
    gasPrice,
  });
  await publicClient.waitForTransactionReceipt({ hash: hash1 });
  console.log(`  Escrow -> Dispute linked (${hash1})`);

  const repAbi = loadArtifact("EtaloReputation").abi;
  const hash2 = await walletClient.writeContract({
    address: ALREADY.EtaloReputation,
    abi: repAbi,
    functionName: "setAuthorizedCaller",
    args: [escrow.address, true],
    type: "legacy" as any,
    gasPrice,
  });
  await publicClient.waitForTransactionReceipt({ hash: hash2 });
  console.log(`  Reputation authorized Escrow (${hash2})`);

  const hash3 = await walletClient.writeContract({
    address: ALREADY.EtaloReputation,
    abi: repAbi,
    functionName: "setAuthorizedCaller",
    args: [dispute.address, true],
    type: "legacy" as any,
    gasPrice,
  });
  await publicClient.waitForTransactionReceipt({ hash: hash3 });
  console.log(`  Reputation authorized Dispute (${hash3})`);

  // Save deployment data
  const deploymentData = {
    network: "celoSepolia",
    chainId: 11142220,
    deployer: account.address,
    treasury: account.address,
    contracts: {
      MockUSDT: ALREADY.MockUSDT,
      EtaloReputation: ALREADY.EtaloReputation,
      EtaloEscrow: escrow.address,
      EtaloDispute: dispute.address,
    },
    deployedAt: new Date().toISOString(),
  };

  const deploymentsDir = path.join("deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, "celo-sepolia.json"),
    JSON.stringify(deploymentData, null, 2)
  );

  console.log("\n=== Deployment Complete ===");
  console.log(JSON.stringify(deploymentData, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  console.error(e);
  process.exitCode = 1;
});
