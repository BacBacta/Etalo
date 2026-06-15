/**
 * sweep-credits-eoa.ts — one-off: move the USDT sitting in the retired
 * credits-treasury EOA (0x4515D79C…A060AA) to the Safe.
 *
 * Context: the old mainnet EtaloCredits sent credit-purchase USDT to this
 * EOA (a Sepolia leftover, ADR-024 follow-up). After the redeploy
 * (creditsTreasury → Safe), this sweeps the historical balance home.
 *
 * Signs with EOA_PRIVATE_KEY (the EOA's own key). The EOA needs a little
 * CELO for gas (legacy tx, CLAUDE.md rule #3). Guarded by CONFIRM_SWEEP.
 *
 * Env (.env):
 *   EOA_PRIVATE_KEY     — key of 0x4515… (the source)
 *   SAFE_OWNER_ADDR     — destination Safe
 *   CONFIRM_SWEEP=yes   — accident guard
 *   CELO_RPC            — optional (default forno)
 *
 * Usage:
 *   CONFIRM_SWEEP=yes SAFE_OWNER_ADDR=0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F \
 *     npx tsx scripts/sweep-credits-eoa.ts
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  getAddress,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.CELO_RPC ?? "https://forno.celo.org";
const USDT = getAddress("0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e");
const EXPECTED_EOA = getAddress("0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA");

const celo = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "CeloScan", url: "https://celoscan.io" } },
});

const erc20 = [
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "transfer", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
] as const;

async function main() {
  if (process.env.CONFIRM_SWEEP !== "yes") throw new Error("Set CONFIRM_SWEEP=yes to proceed.");
  const pk = process.env.EOA_PRIVATE_KEY;
  if (!pk) throw new Error("EOA_PRIVATE_KEY not set");
  const dest = process.env.SAFE_OWNER_ADDR;
  if (!dest || !isAddress(dest)) throw new Error("SAFE_OWNER_ADDR missing/invalid");
  const safe = getAddress(dest);

  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : "0x" + pk) as `0x${string}`);
  if (getAddress(account.address) !== EXPECTED_EOA) {
    throw new Error(`EOA_PRIVATE_KEY is ${account.address}, expected ${EXPECTED_EOA}`);
  }

  const transport = http(RPC);
  const pub = createPublicClient({ chain: celo, transport });
  const wallet = createWalletClient({ account, chain: celo, transport });

  const usdtBal = (await pub.readContract({ address: USDT, abi: erc20, functionName: "balanceOf", args: [EXPECTED_EOA] })) as bigint;
  const celoBal = await pub.getBalance({ address: EXPECTED_EOA });
  console.log(`Source EOA: ${EXPECTED_EOA}`);
  console.log(`  USDT: ${formatUnits(usdtBal, 6)}  |  CELO (gas): ${formatUnits(celoBal, 18)}`);
  console.log(`Destination Safe: ${safe}`);

  if (usdtBal === 0n) {
    console.log("Nothing to sweep (USDT balance is 0).");
    return;
  }
  if (celoBal === 0n) {
    throw new Error("EOA has 0 CELO for gas. Send a little CELO to it, then re-run.");
  }

  const gasPrice = await pub.getGasPrice();
  const hash = await wallet.writeContract({
    address: USDT,
    abi: erc20,
    functionName: "transfer",
    args: [safe, usdtBal],
    type: "legacy" as any,
    gasPrice,
  });
  console.log(`Sweep tx: ${hash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(receipt.status === "success" ? "✅ Swept to Safe." : "❌ Tx reverted.");

  const after = (await pub.readContract({ address: USDT, abi: erc20, functionName: "balanceOf", args: [safe] })) as bigint;
  console.log(`Safe USDT balance now: ${formatUnits(after, 6)}`);
}

main().catch((e) => { console.error(e.shortMessage ?? e.message ?? e); process.exit(1); });
