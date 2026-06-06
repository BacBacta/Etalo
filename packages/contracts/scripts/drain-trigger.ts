/**
 * drain-trigger.ts — Manually fire the permissionless release/refund
 * triggers that the keepers would normally call automatically.
 *
 * Targets: items whose finalReleaseAfter is already elapsed + one
 * Funded order past its auto-refund deadline. All calls are
 * permissionless — any funded wallet can send them.
 *
 * Usage (from packages/contracts):
 *   npx tsx scripts/drain-trigger.ts
 *
 * Requires PRIVATE_KEY in .env (the deployer EOA is fine — it holds CELO).
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
const ESCROW = "0x0890D9bCE4E71148b135A99Cf501DE52Aa05Ee92" as const;

const celo = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "CeloScan", url: "https://celoscan.io" } },
});

const ABI = [
  {
    type: "function",
    name: "triggerAutoReleaseForItem",
    inputs: [{ name: "orderId", type: "uint256" }, { name: "itemId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "triggerAutoRefundIfInactive",
    inputs: [{ name: "orderId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

async function send(
  wc: ReturnType<typeof createWalletClient>,
  pc: ReturnType<typeof createPublicClient>,
  label: string,
  fn: () => Promise<`0x${string}`>,
) {
  process.stdout.write(`${label} ... `);
  try {
    const hash = await fn();
    const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status === "success") {
      console.log(`✅ ${hash}`);
    } else {
      console.log(`❌ reverted ${hash}`);
    }
  } catch (e: any) {
    console.log(`❌ ${e.shortMessage ?? e.message}`);
  }
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");
  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);
  const transport = http(RPC);
  const pc = createPublicClient({ chain: celo, transport });
  const wc = createWalletClient({ account, chain: celo, transport });
  const gasPrice = await pc.getGasPrice();

  console.log(`Sender: ${account.address}`);
  console.log(`Escrow: ${ESCROW}\n`);

  // Phase 1 already done — skip #1/#2/#9/#10 (already drained).
  // Phase 2 — refund #8 and #12 (Funded, 7-day window).
  // The contract reverts if the deadline hasn't elapsed yet ("Inactive deadline not reached").
  // The send() helper catches that and logs ❌ with the revert reason — safe to retry.
  await send(wc, pc, "#8  order8  triggerAutoRefundIfInactive (0.05 USDT → buyer)", () =>
    wc.writeContract({ address: ESCROW, abi: ABI, functionName: "triggerAutoRefundIfInactive", args: [8n], type: "legacy" as any, gasPrice }),
  );
  await send(wc, pc, "#12 order12 triggerAutoRefundIfInactive (0.05 USDT → buyer)", () =>
    wc.writeContract({ address: ESCROW, abi: ABI, functionName: "triggerAutoRefundIfInactive", args: [12n], type: "legacy" as any, gasPrice }),
  );

  console.log("\n#13 (disputed, 0.02 USDT) still needs Safe resolution — see calldata in chat.");
}

main().catch((e) => { console.error(e); process.exit(1); });
