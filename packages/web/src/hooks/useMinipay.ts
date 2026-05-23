import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";

import { detectMiniPay } from "@/lib/minipay-detect";

// Hard ceiling on the "Connecting to MiniPay…" surface. 3 s — long
// enough for a healthy production auto-connect (typically 50-300 ms)
// to land, short enough that a stuck user gets the manual escape
// surface fast.
const CONNECT_TIMEOUT_MS = 3_000;

/**
 * MiniPay session observer + manual retry surface.
 *
 * The auto-connect IS NOT owned here anymore — `SilentReconnectGate`
 * (mounted once at the app root in Providers.tsx) owns the on-mount
 * `connect()` call. Having two surfaces fire `connect()` concurrently
 * raced wagmi's internal state on first paint (PR #56 user report :
 * "Connecting…" stuck forever on first visit, then fine after
 * disconnect+reopen because the second visit only had silent
 * `eth_accounts` to resolve).
 *
 * This hook now :
 *  - Reports whether we're in MiniPay context (lenient + strict)
 *  - Exposes the wagmi connection state through a MiniPay-aware lens
 *    (isConnecting only flips for "pending" inside MiniPay so Chrome
 *    users don't get "Connecting to MiniPay…" on their reconnect tick)
 *  - Times out at CONNECT_TIMEOUT_MS so the dashboard's Retry surface
 *    is reachable even when the WebView hangs the request
 *  - Provides `retry()` which the dashboard's "Open my boutique"
 *    button calls — a user-gesture-driven connect that satisfies
 *    the WebView's gesture requirement when the on-mount auto-
 *    connect was rejected silently.
 *
 * Returns `{ isInMinipay, isStrictMinipay, address, isConnected,
 * isConnecting, connectFailed, retry }`.
 */
export function useMinipay() {
  const { connect, connectors, status } = useConnect();
  const { address, isConnected } = useAccount();

  const isInMinipay = detectMiniPay();
  // Strict detection — does the WebView's provider actually carry the
  // canonical `isMiniPay` flag ? Documented exposed for callers that
  // want to differentiate real production behaviour from Test / dev
  // surfaces. Empirically, EVEN with the flag set MiniPay's WebView
  // sometimes refuses non-gesture `eth_requestAccounts` on first
  // visit, so the dashboard renders the tap-to-connect button in
  // ALL MiniPay contexts regardless of this flag.
  const isStrictMinipay =
    typeof window !== "undefined" &&
    (window as Window & { ethereum?: { isMiniPay?: boolean } }).ethereum
      ?.isMiniPay === true;
  // Only treat wagmi pending as a MiniPay connect-in-flight signal
  // when we ARE in MiniPay. Outside (Chrome, Safari) the same
  // `status === "pending"` can come from wagmi's own reconnect-on-
  // mount and previously surfaced the "Connecting to MiniPay…"
  // message on non-MiniPay users.
  const isConnecting = isInMinipay && status === "pending";
  const [connectFailed, setConnectFailed] = useState(false);

  // Timeout watchdog. Arms only while connect is in flight inside
  // MiniPay. Clears the moment we succeed, leave the pending state,
  // or unmount. If it fires, the dashboard surfaces Retry.
  useEffect(() => {
    if (!isInMinipay) return;
    if (isConnected) {
      setConnectFailed(false);
      return;
    }
    if (!isConnecting) return;
    const id = window.setTimeout(() => setConnectFailed(true), CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [isInMinipay, isConnected, isConnecting]);

  // Pick the connector that can accept window.ethereum and fire
  // connect(). Real MiniPay (strict flag) → `minipay` connector ;
  // Test mode / ngrok / Chrome → EIP-6963-specific or generic
  // `injected`. Logic mirrors SilentReconnectGate's picker.
  const retry = useCallback(() => {
    setConnectFailed(false);
    const strict =
      typeof window !== "undefined" &&
      (window as Window & { ethereum?: { isMiniPay?: boolean } }).ethereum
        ?.isMiniPay === true;
    const target = strict
      ? connectors.find((c) => c.id === "minipay")
      : (connectors.find(
          (c) =>
            c.type === "injected" &&
            c.id !== "injected" &&
            c.id !== "minipay" &&
            c.id !== "walletConnect",
        ) ??
        connectors.find((c) => c.id === "injected"));
    if (target) connect({ connector: target });
  }, [connectors, connect]);

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
