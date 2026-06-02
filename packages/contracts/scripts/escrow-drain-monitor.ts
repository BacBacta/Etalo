/**
 * escrow-drain-monitor.ts — READ-ONLY drain tracker for the ADR-057
 * EtaloEscrow redeploy (migration plan §3 Option A).
 *
 * Lists the OLD escrow's in-flight orders (those still holding USDT) and
 * the on-chain `totalEscrowedAmount`. Run repeatedly during the drain
 * window until BOTH reach 0 — that is the green light to cut the
 * satellites over to the new escrow.
 *
 * Pure reads. Performs no transaction. Safe to run anytime.
 *
 * Env (.env):
 *   CELO_RPC         — Celo mainnet RPC (default: forno)
 *   ESCROW_ADDRESS   — old escrow (default: mainnet v1.4 escrow)
 *
 * Usage:
 *   npx hardhat run scripts/escrow-drain-monitor.ts --network celoMainnet
 *   # or: ESCROW_ADDRESS=0x... npx tsx scripts/escrow-drain-monitor.ts
 */
import "dotenv/config";
import { createPublicClient, defineChain, http, formatUnits } from "viem";

const RPC_URL = process.env.CELO_RPC ?? "https://forno.celo.org";
const OLD_ESCROW =
  (process.env.ESCROW_ADDRESS as `0x${string}`) ??
  "0x0890D9bCE4E71148b135A99Cf501DE52Aa05Ee92";

const celoMainnet = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

// Minimal ABI — only the views we need.
const ORDER_TUPLE = {
  type: "tuple",
  components: [
    { name: "orderId", type: "uint256" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "totalAmount", type: "uint256" },
    { name: "totalCommission", type: "uint256" },
    { name: "createdAt", type: "uint256" },
    { name: "fundedAt", type: "uint256" },
    { name: "isCrossBorder", type: "bool" },
    { name: "globalStatus", type: "uint8" },
    { name: "itemCount", type: "uint256" },
    { name: "shipmentGroupCount", type: "uint256" },
  ],
} as const;

const ESCROW_ABI = [
  { type: "function", name: "getOrderCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalEscrowedAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getOrder", stateMutability: "view", inputs: [{ name: "orderId", type: "uint256" }], outputs: [ORDER_TUPLE] },
] as const;

// In-flight = still holds escrowed funds (not a terminal state).
const STATUS = ["Created", "Funded", "PartiallyShipped", "AllShipped", "PartiallyDelivered", "Completed", "Disputed", "Refunded", "Cancelled"];
const IN_FLIGHT = new Set([1, 2, 3, 4, 6]); // Funded, PartiallyShipped, AllShipped, PartiallyDelivered, Disputed

async function main() {
  const client = createPublicClient({ chain: celoMainnet, transport: http(RPC_URL) });
  const escrow = { address: OLD_ESCROW, abi: ESCROW_ABI } as const;

  const [count, totalEscrowed] = await Promise.all([
    client.readContract({ ...escrow, functionName: "getOrderCount" }),
    client.readContract({ ...escrow, functionName: "totalEscrowedAmount" }),
  ]);

  console.log(`\nOLD ESCROW ${OLD_ESCROW}`);
  console.log(`totalEscrowedAmount: ${formatUnits(totalEscrowed as bigint, 6)} USDT`);
  console.log(`orders created: ${count}\n`);

  const inFlight: { id: bigint; status: string; xborder: boolean; amount: string }[] = [];
  for (let i = 1n; i <= (count as bigint); i++) {
    const o: any = await client.readContract({ ...escrow, functionName: "getOrder", args: [i] });
    const st = Number(o.globalStatus);
    if (IN_FLIGHT.has(st)) {
      inFlight.push({
        id: i,
        status: STATUS[st] ?? String(st),
        xborder: o.isCrossBorder,
        amount: formatUnits(o.totalAmount as bigint, 6),
      });
    }
  }

  if (inFlight.length === 0) {
    console.log("✅ No in-flight orders. If totalEscrowedAmount is also 0, the");
    console.log("   old escrow is fully drained — safe to cut over (plan §3.4).");
  } else {
    console.log(`⏳ ${inFlight.length} in-flight order(s) still holding funds:`);
    for (const o of inFlight) {
      console.log(`   #${o.id}  ${o.status.padEnd(18)} ${o.amount} USDT${o.xborder ? "  [cross-border]" : ""}`);
    }
    console.log("\n   Disputed → resolve on the OLD Dispute before cutover.");
    console.log("   Partially*/AllShipped with stuck Pending items → buyer opens a");
    console.log("   dispute to recover (plan §4). Funded → keepers trigger auto-");
    console.log("   release/refund once the ADR-019 window elapses.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
