import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";

/**
 * Silent MiniPay auto-connect.
 *
 * When the Mini App boots inside MiniPay's WebView, the provider is
 * already available at `window.ethereum`. We attempt to connect
 * silently on mount — per CLAUDE.md connection UX, we never surface
 * "Connecting..." to the user.
 *
 * Returns `{ isInMinipay, address, isConnected, isConnecting }` so
 * callers can gate UI without building their own detection.
 * `address` is only ever passed around internally — never render it.
 */
export function useMinipay() {
  const { connect, connectors, status } = useConnect();
  const { address, isConnected } = useAccount();

  const isInMinipay =
    typeof window !== "undefined" && window.ethereum?.isMiniPay === true;

  useEffect(() => {
    if (!isInMinipay || isConnected || status === "pending") return;
    const minipay = connectors.find((c) => c.id === "minipay");
    if (minipay) connect({ connector: minipay });
  }, [isInMinipay, isConnected, status, connectors, connect]);

  return {
    isInMinipay,
    address,
    isConnected,
    isConnecting: status === "pending",
  };
}
