import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";

import { detectMiniPay } from "@/lib/minipay-detect";

/**
 * Silent MiniPay auto-connect.
 *
 * When the Mini App boots inside MiniPay's WebView, the provider is
 * already available at `window.ethereum`. We attempt to connect
 * silently on mount — per CLAUDE.md connection UX, we never surface
 * "Connecting..." to the user.
 *
 * Returns `{ isInMinipay, address, isConnected, isConnecting }` so
 * callers can gate UI without building their own detection. The
 * `isInMinipay` flag uses the shared `detectMiniPay()` helper
 * (Pattern D — env override + canonical flag + UA fallback for
 * Mini App Test mode). `address` is only ever passed around
 * internally — never render it.
 */
export function useMinipay() {
  const { connect, connectors, status } = useConnect();
  const { address, isConnected } = useAccount();

  const isInMinipay = detectMiniPay();

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
