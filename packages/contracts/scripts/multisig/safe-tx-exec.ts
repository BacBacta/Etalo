/**
 * scripts/multisig/safe-tx-exec.ts — Build, sign, and execute a
 * single Safe transaction using 2 EOAs from .env (deployer + a
 * second test wallet). The 3rd Safe owner (mobile passkey) is not
 * required when 2 EOAs already provide the 2-of-3 threshold.
 *
 * Use cases :
 *   - Sepolia rehearsal : "rotation back to deployer" after the
 *     transfer-ownership.ts run, so smoke scripts stay runnable
 *     without going through Safe Wallet UI every time.
 *   - Mainnet emergencies : if the mobile signer is unreachable
 *     but 2 EOAs can cosign and act (rare path).
 *
 * Env-var "flags" :
 *   MULTISIG_NETWORK         celoSepolia (default) | celoMainnet
 *   SAFE_ADDRESS             target Safe (must be a deployed Gnosis Safe)
 *   TARGET_CONTRACT          contract to call (0x…)
 *   TARGET_DATA              encoded calldata (0x…) — use viem
 *                            encodeFunctionData() or build off-line
 *   SIGNER_1_PK_ENV          name of the env var containing 1st PK
 *                            (default: PRIVATE_KEY)
 *   SIGNER_2_PK_ENV          name of the env var containing 2nd PK
 *                            (default: TEST_CHIOMA_PK)
 *   DRY_RUN=1                build + sign + log calldata, no broadcast
 *
 * Example — rotate ownership of EtaloEscrow back to deployer via
 *           the Sepolia rehearsal Safe :
 *
 *   SAFE_ADDRESS=0x… \
 *   TARGET_CONTRACT=0xc8174b1218fEbD7d49B982cB3f1De83e411FbEA1 \
 *   TARGET_DATA=0xf2fde38b000000000000000000000000fcfe723245e1e926ae676025138ca2c38ecba8d8 \
 *     npx hardhat run scripts/multisig/safe-tx-exec.ts --network celoSepolia
 *
 * The TARGET_DATA above is `transferOwnership(0xfcfE…)` for the
 * deployer EOA.
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  getAddress,
  isHex,
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
  },
  celoMainnet: {
    chainId: 42220,
    name: "Celo Mainnet",
    rpc: process.env.CELO_MAINNET_RPC ?? "https://forno.celo.org",
    explorer: "https://celoscan.io",
  },
} as const;

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === "1" || v === "true";
}

function parseEnv(): Record<string, string> {
  const content = fs.readFileSync(".env", "utf8");
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
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

  const safeAddrRaw = process.env.SAFE_ADDRESS;
  if (!safeAddrRaw || !isAddress(safeAddrRaw)) {
    throw new Error(`SAFE_ADDRESS missing/invalid (got "${safeAddrRaw}").`);
  }
  const SAFE = getAddress(safeAddrRaw);

  const targetRaw = process.env.TARGET_CONTRACT;
  if (!targetRaw || !isAddress(targetRaw)) {
    throw new Error(`TARGET_CONTRACT missing/invalid (got "${targetRaw}").`);
  }
  const TARGET = getAddress(targetRaw);

  const data = process.env.TARGET_DATA;
  if (!data || !isHex(data)) {
    throw new Error(`TARGET_DATA missing/invalid (must be 0x-prefixed hex, got "${data}").`);
  }

  const env = parseEnv();
  const pk1 = pkFromEnv(env, process.env.SIGNER_1_PK_ENV ?? "PRIVATE_KEY");
  const pk2 = pkFromEnv(env, process.env.SIGNER_2_PK_ENV ?? "TEST_CHIOMA_PK");

  const signer1 = privateKeyToAccount(pk1);
  const signer2 = privateKeyToAccount(pk2);

  const chain = defineChain({
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpc] } },
    blockExplorers: { default: { name: "Explorer", url: cfg.explorer } },
    testnet: cfg.chainId !== 42220,
  });
  const pub = createPublicClient({ chain, transport: http(cfg.rpc) });

  console.log("=== Safe tx executor (2 EOA signers) ===");
  console.log(`Network    : ${cfg.name}`);
  console.log(`Safe       : ${SAFE}`);
  console.log(`Target     : ${TARGET}`);
  console.log(`Data       : ${data.slice(0, 10)}…${data.slice(-6)}  (${(data.length - 2) / 2} bytes)`);
  console.log(`Signer 1   : ${signer1.address}`);
  console.log(`Signer 2   : ${signer2.address}\n`);

  // Sanity : SAFE has bytecode
  const safeCode = await pub.getCode({ address: SAFE });
  if (!safeCode || safeCode === "0x") {
    throw new Error(`Safe ${SAFE} has no bytecode on ${cfg.name}.`);
  }

  // Initialize Safe SDK on signer 1
  const safeSdkSigner1 = await Safe.init({
    provider: cfg.rpc,
    signer: pk1,
    safeAddress: SAFE,
  });
  const owners = await safeSdkSigner1.getOwners();
  const threshold = await safeSdkSigner1.getThreshold();
  console.log(`Safe owners (${owners.length}) :`);
  for (const o of owners) console.log(`  - ${o}${o.toLowerCase() === signer1.address.toLowerCase() ? " (signer 1)" : o.toLowerCase() === signer2.address.toLowerCase() ? " (signer 2)" : ""}`);
  console.log(`Threshold  : ${threshold}-of-${owners.length}`);

  if (!owners.map((o) => o.toLowerCase()).includes(signer1.address.toLowerCase())) {
    throw new Error(`Signer 1 ${signer1.address} is NOT an owner of the Safe.`);
  }
  if (!owners.map((o) => o.toLowerCase()).includes(signer2.address.toLowerCase())) {
    throw new Error(`Signer 2 ${signer2.address} is NOT an owner of the Safe.`);
  }
  if (threshold > 2) {
    throw new Error(`Safe threshold is ${threshold} — this script only assembles 2 signatures. Adapt or sign more.`);
  }

  // Build the Safe tx
  const safeTx = await safeSdkSigner1.createTransaction({
    transactions: [
      {
        to: TARGET,
        value: "0",
        data,
      },
    ],
  });
  const safeTxHash = await safeSdkSigner1.getTransactionHash(safeTx);
  console.log(`\nSafe tx hash : ${safeTxHash}`);

  if (envFlag("DRY_RUN")) {
    console.log(`\n✅ DRY RUN complete — no signatures collected, no broadcast.`);
    return;
  }

  // Sign with signer 1
  console.log(`\n--- Signing with signer 1 (${signer1.address}) ---`);
  const sig1Tx = await safeSdkSigner1.signTransaction(safeTx);

  // Sign with signer 2 — re-init the SDK with signer 2's key
  console.log(`--- Signing with signer 2 (${signer2.address}) ---`);
  const safeSdkSigner2 = await Safe.init({
    provider: cfg.rpc,
    signer: pk2,
    safeAddress: SAFE,
  });
  const sig2Tx = await safeSdkSigner2.signTransaction(sig1Tx);

  // Execute — anyone can submit ; we use signer 1 to broadcast
  console.log(`\n--- Submitting via signer 1 (gas payer) ---`);
  const exec = await safeSdkSigner1.executeTransaction(sig2Tx);
  const hash = exec.hash as `0x${string}`;
  console.log(`  Broadcast : ${cfg.explorer}/tx/${hash}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Safe tx execution reverted (tx ${hash}).`);
  }
  console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
}

main().catch((e) => {
  console.error("\nFATAL:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
