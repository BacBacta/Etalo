import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useConnect } from "wagmi";

import { detectMiniPay } from "@/lib/minipay-detect";
import { walletLog } from "@/lib/wallet-debug";

// Hard ceiling on the "in-flight" surface. 8 s comfortably above the
// p95 connect time observed in MiniPay Test mode ; if `isConnected`
// hasn't flipped true by then, the dashboard surfaces Retry.
const CONNECT_TIMEOUT_MS = 8_000;

// Diagnostic logger — pushes to both console.info and the on-screen
// WalletDebugOverlay (activated via `?debug=wallet`). The overlay is
// the field-readable surface for users without Chrome DevTools access
// to their device.
function dlog(...args: unknown[]) {
  if (typeof window === "undefined") return;
  walletLog("[useMinipay]", ...args);
  // Mirror to console too in case Chrome DevTools IS connected.
  try {
    console.info("[useMinipay]", ...args);
  } catch {
    // ignore
  }
}

/**
 * MiniPay auto-connect hook (restored from reverted commit 8f56b91 +
 * 2026-05-23 hardening).
 *
 * Owns the on-mount `connect()` side-effect for any surface that gates
 * the user experience on a wallet being present (the seller dashboard,
 * /orders, RequireWallet, useOrderInitiate, …). Without this hook on
 * the surface, MiniPay's `window.ethereum` sits there and
 * `useAccount().isConnected` never flips true.
 *
 * `SilentReconnectGate` (in Providers.tsx) is the complementary surface
 * for non-MiniPay returning sessions (Chrome with a prior MetaMask
 * approval). It deliberately does NOT cover MiniPay — `useMinipay` is
 * the single owner of the MiniPay handshake to avoid the race where
 * both surfaces fire `connect()` concurrently.
 *
 * Watchdog robustness (2026-05-23) — the watchdog arms on MOUNT (not
 * on `isConnecting`) and clears ONLY on `isConnected=true` or unmount.
 * The previous design cleared the timeout whenever `isConnecting`
 * flipped false, which masked the failure mode where wagmi went
 * pending → error silently and left the user stuck on the dashboard
 * skeleton forever with no Retry surface (production bug). The hook
 * also listens for `status === "error"` to surface Retry immediately
 * regardless of timing.
 */
export function useMinipay() {
  const { connect, connectors, status, error: connectError } = useConnect();
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
      const minipay = connectors.find((c) => c.id === "minipay");
      dlog("pickTarget strict", { id: minipay?.id, found: Boolean(minipay) });
      return minipay;
    }
    const eip6963 = connectors.find(
      (c) =>
        c.type === "injected" &&
        c.id !== "injected" &&
        c.id !== "minipay" &&
        c.id !== "walletConnect",
    );
    const generic = connectors.find((c) => c.id === "injected");
    const picked = eip6963 ?? generic;
    dlog("pickTarget lenient", {
      id: picked?.id,
      eip6963: eip6963?.id,
      generic: generic?.id,
    });
    return picked;
  }, [connectors]);

  // Auto-connect on mount inside MiniPay. Retries on dep changes
  // (connectors list updates, isInMinipay flips client-side) until a
  // real connect call fires.
  useEffect(() => {
    if (firedRef.current) return;
    if (!isInMinipay || isConnected) return;
    if (status === "pending") return;
    const target = pickTarget();
    if (!target) {
      dlog("auto-connect bail: no target");
      return;
    }
    firedRef.current = true;
    dlog("auto-connect fire", { id: target.id, status });
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
      dlog("watchdog fire");
      setConnectFailed(true);
    }, CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [isInMinipay, isConnected]);

  // wagmi error listener — surface Retry IMMEDIATELY when the connect
  // mutation rejects, so the user doesn't have to wait the watchdog
  // timeout to escape the dashboard skeleton. Also captures the full
  // wagmi error object so the on-screen debug overlay shows WHAT
  // failed (RPC method, code, message).
  useEffect(() => {
    if (!isInMinipay) return;
    if (status === "error" && !isConnected) {
      dlog("status=error → flip connectFailed", {
        errorName: connectError?.name ?? null,
        errorMessage: connectError?.message?.slice(0, 200) ?? null,
        // Wagmi sometimes nests the provider error under `.cause`
        causeName:
          connectError && "cause" in connectError
            ? String((connectError as { cause?: { name?: string } }).cause?.name ?? "")
            : null,
        causeMessage:
          connectError && "cause" in connectError
            ? String(
                (connectError as { cause?: { message?: string } }).cause?.message ?? "",
              ).slice(0, 200)
            : null,
      });
      setConnectFailed(true);
    }
  }, [status, isInMinipay, isConnected, connectError]);

  // Trace every state change for debug sessions.
  useEffect(() => {
    dlog("state", {
      isInMinipay,
      isStrictMinipay,
      isConnected,
      address,
      status,
      isConnecting,
      connectFailed,
      connectorCount: connectors.length,
      connectorIds: connectors.map((c) => c.id),
    });
  }, [
    isInMinipay,
    isStrictMinipay,
    isConnected,
    address,
    status,
    isConnecting,
    connectFailed,
    connectors,
  ]);

  const retry = useCallback(() => {
    setConnectFailed(false);
    firedRef.current = false;
    const target = pickTarget();
    dlog("retry", { id: target?.id });
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
