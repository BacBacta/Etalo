/**
 * scripts/multisig/create-safe-mainnet.ts — One-shot programmatic
 * deploy of the Etalo V1 mainnet multisig Safe.
 *
 * Per ADR-055 third update : 2-of-3 "shadow Mike" Safe with owners
 * [mobile passkey, deployer, cold recovery EOA].
 *
 * Uses @safe-global/protocol-kit SafeFactory to deploy a fresh Safe
 * via the canonical SafeProxyFactory at the predicted address. The
 * deployer wallet pays gas.
 *
 * Env required :
 *   PRIVATE_KEY              deployer (≥ 0.05 CELO for Safe creation gas)
 *   COLD_KEY_ADDRESS         signer #3 EOA address (paper seed elsewhere)
 *   MOBILE_PASSKEY_ADDRESS   signer #1 EOA address (Safe Wallet mobile app)
 *   CELO_MAINNET_RPC         optional, defaults to forno
 *   CONFIRM_MAINNET=1        REQUIRED — explicit mainnet acknowledgement
 *
 * Usage :
 *   CONFIRM_MAINNET=1 \
 *   COLD_KEY_ADDRESS=0x… \
 *   MOBILE_PASSKEY_ADDRESS=0x… \
 *     npx hardhat run scripts/multisig/create-safe-mainnet.ts \
 *     --network celoMainnet
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  getAddress,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import Safe from "@safe-global/protocol-kit";
import * as fs from "fs";

const RPC_URL = process.env.CELO_MAINNET_RPC ?? "https://forno.celo.org";

const celoMainnet = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "CeloScan", url: "https://celoscan.io" } },
  testnet: false,
});

function fail(msg: string): never {
  console.error(`\n❌ FATAL: ${msg}\n`);
  process.exit(1);
}

async function main() {
  // ── Safety guards ─────────────────────────────────────────
  if (process.env.CONFIRM_MAINNET !== "1") {
    fail("MAINNET Safe creation requires CONFIRM_MAINNET=1 env var.");
  }

  const pk = process.env.PRIVATE_KEY;
  if (!pk) fail("PRIVATE_KEY missing from .env");

  const coldKeyRaw = process.env.COLD_KEY_ADDRESS;
  if (!coldKeyRaw || !isAddress(coldKeyRaw)) {
    fail(`COLD_KEY_ADDRESS missing/invalid (got "${coldKeyRaw}")`);
  }
  const COLD_KEY = getAddress(coldKeyRaw);

  const mobileRaw = process.env.MOBILE_PASSKEY_ADDRESS;
  if (!mobileRaw || !isAddress(mobileRaw)) {
    fail(`MOBILE_PASSKEY_ADDRESS missing/invalid (got "${mobileRaw}")`);
  }
  const MOBILE_PASSKEY = getAddress(mobileRaw);

  const deployer = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const DEPLOYER = deployer.address;

  // Owners must be 3 distinct addresses
  const owners = [MOBILE_PASSKEY, DEPLOYER, COLD_KEY];
  const unique = new Set(owners.map((a) => a.toLowerCase()));
  if (unique.size !== 3) {
    fail(`Duplicate owners detected: ${owners.join(", ")}`);
  }

  // Chain sanity
  const pub = createPublicClient({ chain: celoMainnet, transport: http(RPC_URL) });
  const chainId = await pub.getChainId();
  if (chainId !== 42220) fail(`Expected Celo mainnet 42220, got ${chainId}`);

  // Deployer balance
  const balance = await pub.getBalance({ address: DEPLOYER });
  const balanceCelo = Number(balance) / 1e18;
  if (balanceCelo < 0.05) {
    fail(`Deployer balance ${balanceCelo.toFixed(4)} CELO < 0.05 minimum for Safe deploy.`);
  }

  console.log("=== Etalo mainnet Safe creation ===");
  console.log(`⚠️  PRODUCTION DEPLOY — real Safe, real owners, real authority`);
  console.log(`Network         : Celo mainnet (chainId 42220)`);
  console.log(`Deployer        : ${DEPLOYER}  (${balanceCelo.toFixed(4)} CELO)`);
  console.log(`\nProposed owners (3, threshold 2) :`);
  console.log(`  Owner 1 (mobile passkey) : ${MOBILE_PASSKEY}`);
  console.log(`  Owner 2 (deployer)       : ${DEPLOYER}`);
  console.log(`  Owner 3 (cold recovery)  : ${COLD_KEY}`);
  console.log("");

  // ── Protocol-kit v7 : predict address + build deploy tx ──
  console.log("Initializing Safe SDK with predicted Safe config…");
  const protocolKit = await Safe.init({
    provider: RPC_URL,
    signer: `0x${pk.replace(/^0x/, "")}`,
    predictedSafe: {
      safeAccountConfig: { owners, threshold: 2 },
    },
  });

  const predictedAddress = await protocolKit.getAddress();
  console.log(`Predicted Safe address : ${predictedAddress}`);

  // Build the deployment tx
  console.log("\nBuilding Safe deployment transaction…");
  const deploymentTx = await protocolKit.createSafeDeploymentTransaction();

  // Execute via the deployer's wallet client
  const walletClient = createWalletClient({
    account: deployer,
    chain: celoMainnet,
    transport: http(RPC_URL),
  });

  console.log("Broadcasting deployment tx…");
  const gasPrice = await pub.getGasPrice();
  const txHash = await walletClient.sendTransaction({
    to: deploymentTx.to as `0x${string}`,
    data: deploymentTx.data as `0x${string}`,
    value: BigInt(deploymentTx.value),
    type: "legacy" as any,
    gasPrice,
  });
  console.log(`  tx : https://celoscan.io/tx/${txHash}`);

  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    fail(`Safe deployment tx reverted (block ${receipt.blockNumber})`);
  }

  const safeAddress = getAddress(predictedAddress as `0x${string}`);
  console.log(`\n✅ Safe deployed at : ${safeAddress}`);
  console.log(`   Block            : ${receipt.blockNumber}`);
  console.log(`   Explorer         : https://celoscan.io/address/${safeAddress}`);

  // Reconnect SDK to the now-deployed Safe (for the verification step below)
  const deployedSafe = await Safe.init({
    provider: RPC_URL,
    signer: `0x${pk.replace(/^0x/, "")}`,
    safeAddress,
  });

  // ── Verify on chain ──────────────────────────────────────
  console.log("\n=== Verification ===");
  const safeOwners = await deployedSafe.getOwners();
  const safeThreshold = await deployedSafe.getThreshold();
  console.log(`Owners on chain (${safeOwners.length}) :`);
  safeOwners.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
  console.log(`Threshold        : ${safeThreshold}-of-${safeOwners.length}`);
  console.log(`Nonce (initial)  : ${await deployedSafe.getNonce()}`);

  if (safeOwners.length !== 3) fail(`Expected 3 owners, got ${safeOwners.length}`);
  if (safeThreshold !== 2) fail(`Expected threshold 2, got ${safeThreshold}`);
  const onChainSet = new Set(safeOwners.map((o) => o.toLowerCase()));
  for (const expected of owners) {
    if (!onChainSet.has(expected.toLowerCase())) {
      fail(`Expected owner ${expected} not found on chain`);
    }
  }

  // ── Persist result ───────────────────────────────────────
  const result = {
    network: "celoMainnet",
    chainId: 42220,
    safeAddress,
    threshold: 2,
    owners: {
      mobilePasskey: MOBILE_PASSKEY,
      deployer: DEPLOYER,
      coldRecovery: COLD_KEY,
    },
    deployer: DEPLOYER,
    deployedAt: new Date().toISOString(),
    explorer: `https://celoscan.io/address/${safeAddress}`,
  };
  fs.writeFileSync(
    "scripts/multisig/mainnet-safe-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(`\nSaved to scripts/multisig/mainnet-safe-result.json`);

  // ── Next step ────────────────────────────────────────────
  console.log("\n=== NEXT STEPS ===");
  console.log("1. Add this Safe address to .env :");
  console.log(`   SAFE_ADDRESS_MAINNET=${safeAddress}`);
  console.log("2. Run the ownership rotation :");
  console.log(`   CONFIRM_MAINNET=1 MULTISIG_NETWORK=celoMainnet \\`);
  console.log(`     SAFE_ADDRESS=${safeAddress} \\`);
  console.log(`     npx hardhat run scripts/multisig/transfer-ownership.ts --network celoMainnet`);
}

main().catch((e) => {
  console.error("\nFATAL:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
