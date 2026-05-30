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
// (locale-dependent strings drift between wallet versions). viem wraps
// the wallet/RPC error in `cause` ; we walk that chain because the
// outer `shortMessage` is often the generic "An unknown RPC error
// occurred." while the actionable detail (e.g. "insufficient funds for
// gas") only appears down the chain.
type ChainedError = {
  name?: string;
  code?: number;
  shortMessage?: string;
  message?: string;
  details?: string;
  cause?: unknown;
};

function collectMessages(err: unknown, depth = 0): string {
  if (!err || typeof err !== "object" || depth > 4) return "";
  const e = err as ChainedError;
  const parts = [e.shortMessage, e.details, e.message].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  const nested = e.cause ? collectMessages(e.cause, depth + 1) : "";
  return `${parts.join(" | ")} ${nested}`.trim();
}

export function classifyError(err: unknown): string {
  if (process.env.NODE_ENV !== "production") {
    // Always surface the raw error so a user-reported failure can be
    // diagnosed by pasting the console output back to the team.
    // eslint-disable-next-line no-console
    console.error("[checkout.classifyError]", err);
  }
  if (!err || typeof err !== "object") return "Unknown error.";
  const e = err as ChainedError;

  // 1. User rejection — by name/code first, by text second.
  if (
    e.name === "UserRejectedRequestError" ||
    e.code === 4001 ||
    e.code === -32604
  ) {
    return "Transaction was cancelled.";
  }

  const haystack = collectMessages(err).toLowerCase();

  if (haystack.includes("rejected") || haystack.includes("denied")) {
    return "Transaction was cancelled.";
  }

  // 2. Wrong chain — viem throws "The current chain of the wallet (id:
  //    X) does not match the target chain for the transaction (id: Y)"
  //    when the wallet is on a chain other than Celo. wagmi's store
  //    can lie about this when the wallet sits on a chain not in
  //    wagmiConfig.chains, so the ChainMismatchBanner sometimes misses
  //    it ; this catches the same case at the user-facing layer.
  if (
    haystack.includes("does not match the target chain") ||
    haystack.includes("chain mismatch")
  ) {
    return "Your wallet is on the wrong network. Open your wallet, switch to Celo Mainnet (chain 42220), then try again.";
  }

  // 3. Celo gas-funding pitfall: Chrome/MetaMask users without CELO
  //    can't pay the network fee, and the RPC bubbles up as a generic
  //    "internal" / "unknown" error from viem. Surface an actionable
  //    hint instead of leaving them guessing. CIP-64 USDT-as-gas is V1.5
  //    (CLAUDE.md rule 3) ; for now the user needs a small CELO balance.
  if (
    haystack.includes("insufficient funds for gas") ||
    haystack.includes("intrinsic gas too low") ||
    haystack.includes("out of gas") ||
    haystack.includes("gas required exceeds")
  ) {
    return "Not enough CELO to pay the network fee. Top up a small amount of CELO in your wallet and try again.";
  }

  // 3. USDT balance — distinct from CELO gas, surfaced separately.
  if (haystack.includes("insufficient")) {
    return "Insufficient balance — make sure you have enough USDT for the order and a small amount of CELO for the network fee.";
  }

  // 4. Network / nonce / congestion.
  if (haystack.includes("timeout")) {
    return "Transaction timed out. Please try again.";
  }
  if (
    haystack.includes("underpriced") ||
    haystack.includes("replacement transaction") ||
    haystack.includes("nonce too low")
  ) {
    return "Network congestion or a stale pending transaction in your wallet. Cancel any pending tx and try again.";
  }
  if (
    haystack.includes("execution reverted") ||
    haystack.includes("transaction reverted")
  ) {
    return "The contract rejected the transaction. Double-check your USDT balance and the seller's order details, then try again.";
  }

  // 5. Last resort — surface the most specific message we have so the
  //    error is at least technically meaningful in the UI.
  if (typeof e.shortMessage === "string" && e.shortMessage.length > 0) {
    return e.shortMessage;
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
