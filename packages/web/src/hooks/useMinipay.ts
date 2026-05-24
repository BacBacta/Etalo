import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useConnect } from "wagmi";

import { detectMiniPay } from "@/lib/minipay-detect";

// Hard ceiling on the "in-flight" surface. 8 s comfortably above the
// p95 connect time observed in MiniPay Test mode ; if `isConnected`
// hasn't flipped true by then, the dashboard surfaces Retry.
const CONNECT_TIMEOUT_MS = 8_000;

/**
 * MiniPay auto-connect hook.
 *
 * Owns the on-mount `connect()` side-effect for any surface that gates
 * the user experience on a wallet being present (the seller dashboard,
 * /orders, RequireWallet, useOrderInitiate, …). Without this hook on
 * the surface, MiniPay's `window.ethereum` sits there and
 * `useAccount().isConnected` never flips true.
 *
 * `SilentReconnectGate` (in AppProviders) is the complementary surface
 * for non-MiniPay returning sessions (Chrome with a prior MetaMask
 * approval). It deliberately does NOT cover MiniPay — `useMinipay` is
 * the single owner of the MiniPay handshake to avoid the race where
 * both surfaces fire `connect()` concurrently.
 *
 * Watchdog robustness (PR #60) — the watchdog arms on MOUNT (not on
 * `isConnecting`) and clears ONLY on `isConnected=true` or unmount.
 * The previous design cleared the timeout whenever `isConnecting`
 * flipped false, which masked the failure mode where wagmi went
 * pending → error silently and left the user stuck on the dashboard
 * skeleton forever with no Retry surface. The hook also listens for
 * `status === "error"` to surface Retry immediately regardless of
 * timing.
 */
export function useMinipay() {
  const { connect, connectors, status } = useConnect();
  const { address, isConnected } = useAccount();

  const isInMinipay = detectMiniPay();
  const isStrictMinipay =
    typeof window !== "undefined" &&
    (window as Window & { ethereum?: { isMiniPay?: boolean } }).ethereum
      ?.isMiniPay === true;
  const isConnecting = isInMinipay && status === "pending";
  const [connectFailed, setConnectFailed] = useState(false);
  const firedRef = useRef(false);

  const pickTarget = useCallback(() => {
    const strict =
      typeof window !== "undefined" &&
      (window as Window & { ethereum?: { isMiniPay?: boolean } }).ethereum
        ?.isMiniPay === true;
    if (strict) {
      return connectors.find((c) => c.id === "minipay");
    }
    const eip6963 = connectors.find(
      (c) =>
        c.type === "injected" &&
        c.id !== "injected" &&
        c.id !== "minipay" &&
        c.id !== "walletConnect",
    );
    const generic = connectors.find((c) => c.id === "injected");
    return eip6963 ?? generic;
  }, [connectors]);

  // Auto-connect on mount inside MiniPay. Retries on dep changes
  // (connectors list updates, isInMinipay flips client-side) until a
  // real connect call fires.
  useEffect(() => {
    if (firedRef.current) return;
    if (!isInMinipay || isConnected) return;
    if (status === "pending") return;
    const target = pickTarget();
    if (!target) return;
    firedRef.current = true;
    connect({ connector: target });
  }, [isInMinipay, isConnected, status, pickTarget, connect]);

  // Watchdog — arms ON MOUNT (not on isConnecting). Only clears when
  // we actually connect or unmount. Without this, a wagmi pending→
  // error transition would clear the timeout (deps changed) before
  // the user gets a Retry surface.
  useEffect(() => {
    if (!isInMinipay) return;
    if (isConnected) {
      setConnectFailed(false);
      return;
    }
    const id = window.setTimeout(() => {
      setConnectFailed(true);
    }, CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [isInMinipay, isConnected]);

  // wagmi error listener — surface Retry IMMEDIATELY when the connect
  // mutation rejects, so the user doesn't have to wait the watchdog
  // timeout to escape the dashboard skeleton.
  useEffect(() => {
    if (!isInMinipay) return;
    if (status === "error" && !isConnected) {
      setConnectFailed(true);
    }
  }, [status, isInMinipay, isConnected]);

  const retry = useCallback(() => {
    setConnectFailed(false);
    firedRef.current = false;
    const target = pickTarget();
    if (target) connect({ connector: target });
  }, [pickTarget, connect]);

  return {
    isInMinipay,
    isStrictMinipay,
    address,
    isConnected,
    isConnecting,
    connectFailed,
    retry,
  };
}
