import { decodeEventLog, type Abi, type Log } from "viem";

const CELO_MAINNET = 42220;
const CELO_SEPOLIA = 11142220;

// Walk the receipt logs, find the EtaloEscrow `OrderCreated` event, and
// return the uint256 orderId. The contract's signature (verified against
// abis/v2/EtaloEscrow.json):
//   event OrderCreated(uint256 indexed orderId, address indexed buyer,
//                      address indexed seller, uint256 totalAmount,
//                      bool isCrossBorder, uint256 itemCount);
export function parseOrderIdFromLog(
  logs: readonly Log[],
  abi: Abi,
): bigint {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "OrderCreated") {
        const args = decoded.args as unknown as { orderId: bigint };
        return args.orderId;
      }
    } catch {
      // Log emitted by another contract or non-matching ABI entry.
    }
  }
  throw new Error("OrderCreated event not found in transaction receipt");
}

// MiniPay best practices: prefer error.code / error.name over message text
// (locale-dependent strings drift between wallet versions).
export function classifyError(err: unknown): string {
  if (!err || typeof err !== "object") return "Unknown error.";
  const e = err as {
    name?: string;
    code?: number;
    shortMessage?: string;
    message?: string;
  };

  if (
    e.name === "UserRejectedRequestError" ||
    e.code === 4001 ||
    e.code === -32604
  ) {
    return "Transaction was cancelled.";
  }

  if (typeof e.shortMessage === "string") {
    const sm = e.shortMessage.toLowerCase();
    if (sm.includes("rejected") || sm.includes("denied")) {
      return "Transaction was cancelled.";
    }
    if (sm.includes("insufficient")) return "Insufficient USDT balance.";
    return e.shortMessage;
  }

  if (typeof e.message === "string") {
    const m = e.message.toLowerCase();
    if (m.includes("rejected")) return "Transaction was cancelled.";
    if (m.includes("timeout")) return "Transaction timed out. Please try again.";
    if (m.includes("insufficient")) return "Insufficient balance.";
  }

  return "Transaction failed. Please try again.";
}

export function buildExplorerUrl(
  txHash: string,
  chainId: number | undefined,
): string {
  if (chainId === CELO_MAINNET) return `https://celoscan.io/tx/${txHash}`;
  if (chainId === CELO_SEPOLIA) {
    return `https://celo-sepolia.blockscout.com/tx/${txHash}`;
  }
  return "#";
}

// Truncate `0x123…abcd` for compact tx-hash display in the success view.
export function shortHash(hash: string): string {
  if (hash.length < 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}
