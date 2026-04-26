import {
  decodeEventLog,
  type Address,
  type PublicClient,
  type TransactionReceipt,
} from "viem";

import escrowAbi from "@/abis/v1/EtaloEscrow.json";

/**
 * Extract the on-chain orderId from a `createOrder` transaction receipt
 * by decoding the `OrderCreated` event logs.
 */
export function parseOrderCreatedFromReceipt(
  receipt: TransactionReceipt,
  escrowAddress: Address,
): bigint {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== escrowAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: escrowAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "OrderCreated") {
        const args = decoded.args as unknown as { orderId: bigint };
        return args.orderId;
      }
    } catch {
      // Skip logs that don't decode against our ABI.
    }
  }
  throw new Error("OrderCreated event not found in receipt");
}

/**
 * Read the current USDT allowance granted by `owner` to `spender`.
 * Returns a bigint (6-decimals raw).
 */
export async function readUsdtAllowance(
  client: PublicClient,
  args: {
    usdt: Address;
    owner: Address;
    spender: Address;
    // ERC-20 ABI — we accept it as an opaque `readonly unknown[]`
    // because each consumer already imports the MockUSDT ABI JSON.
    abi: readonly unknown[];
  },
): Promise<bigint> {
  return (await client.readContract({
    address: args.usdt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abi: args.abi as any,
    functionName: "allowance",
    args: [args.owner, args.spender],
  })) as bigint;
}
