/**
 * resolve-dispute-13.ts — Tx 3 of the #13 dispute resolution.
 *
 * Calls EtaloDispute.resolveN2Mediation(3, 20000, 0) from the deployer
 * EOA (which must already be the assigned N2 mediator — i.e. the two
 * Safe txs approveMediator + assignN2Mediator must be executed FIRST).
 *
 * refundAmount = 20000 (0.02 USDT, full refund to buyer), slashAmount = 0.
 *
 * Usage (from packages/contracts, AFTER the Safe batch is on-chain):
 *   npx tsx scripts/resolve-dispute-13.ts
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://forno.celo.org";
const DISPUTE = "0x6d5Aa5e0EAE407688E99492213849D9a608D63d2" as const;

const celo = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const ABI = [
  {
    type: "function",
    name: "resolveN2Mediation",
    inputs: [
      { name: "disputeId", type: "uint256" },
      { name: "refundAmount", type: "uint256" },
      { name: "slashAmount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getDispute",
    inputs: [{ name: "disputeId", type: "uint256" }],
    outputs: [
      { name: "orderId", type: "uint256" },
      { name: "itemId", type: "uint256" },
      { name: "level", type: "uint8" },
      { name: "resolved", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getN2Mediator",
    inputs: [{ name: "disputeId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");
  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC);
  const pc = createPublicClient({ chain: celo, transport });
  const wc = createWalletClient({ account, chain: celo, transport });

  console.log(`Sender (must be assigned mediator): ${account.address}`);

  // Pre-flight: confirm the Safe batch landed (mediator assigned + still N2).
  const med = (await pc.readContract({ address: DISPUTE, abi: ABI, functionName: "getN2Mediator", args: [3n] })) as string;
  const d = (await pc.readContract({ address: DISPUTE, abi: ABI, functionName: "getDispute", args: [3n] })) as any;
  console.log(`Dispute #3: level=${d[2]} resolved=${d[3]} assignedMediator=${med}`);
  if (med.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Mediator is ${med}, not the sender. Run the Safe approveMediator + assignN2Mediator batch first.`);
  }
  if (d[3]) { console.log("Already resolved — nothing to do."); return; }

  console.log("Sending resolveN2Mediation(3, 20000, 0) ...");
  const gasPrice = await pc.getGasPrice();
  const hash = await wc.writeContract({
    address: DISPUTE,
    abi: ABI,
    functionName: "resolveN2Mediation",
    args: [3n, 20000n, 0n],
    type: "legacy" as any,
    gasPrice,
  });
  const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 120_000 });
  console.log(receipt.status === "success" ? `✅ Resolved: ${hash}` : `❌ Reverted: ${hash}`);
}

main().catch((e) => { console.error(e.shortMessage ?? e.message ?? e); process.exit(1); });
