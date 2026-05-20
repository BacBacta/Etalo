import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useConnect } from "wagmi";

import { detectMiniPay } from "@/lib/minipay-detect";

// Hard ceiling on the "Connecting to MiniPay…" surface. If the
// auto-connect call hasn't resolved (success OR error) within this
// many ms, we flip `connectFailed` so callers can show a retry path
// instead of an infinite "Connecting…" message. 8 s is comfortably
// above p95 connect time observed in MiniPay Test mode, and matches
// the dashboard's wallet-timeout gate.
const CONNECT_TIMEOUT_MS = 8_000;

/**
 * Silent MiniPay auto-connect.
 *
 * When the Mini App boots inside MiniPay's WebView, the provider is
 * already available at `window.ethereum`. We attempt to connect
 * silently on mount — per CLAUDE.md rule 7 connection UX.
 *
 * Hardening (May 2026) :
 *  - `isConnecting` is gated on `isInMinipay`. On regular Chrome /
 *    desktop browsers the wagmi reconnect-on-mount can transiently
 *    flip `status === "pending"`, which used to surface our
 *    "Connecting to MiniPay…" message on Chrome users who aren't
 *    even in MiniPay. They now see the "Please open from MiniPay"
 *    branch directly.
 *  - The auto-connect useEffect attempts the handshake AT MOST ONCE
 *    per mount (tracked via `attemptedRef`). Without this, a connect
 *    rejection that bounces `status` from "pending" → "error" →
 *    "idle" re-triggered the effect (deps changed), which kicked off
 *    a new connect, looping the "Connecting…" indicator forever.
 *  - `connectFailed` also flips true if the auto-connect stays in
 *    `pending` past CONNECT_TIMEOUT_MS so callers can render Retry.
 *
 * Returns `{ isInMinipay, address, isConnected, isConnecting,
 * connectFailed, retry }`.
 */
export function useMinipay() {
  const { connect, connectors, status } = useConnect();
  const { address, isConnected } = useAccount();

  const isInMinipay = detectMiniPay();
  // Crucial : only treat the wagmi pending status as a MiniPay
  // connect-in-flight signal when we ARE in MiniPay. Outside the
  // MiniPay WebView (Chrome, Safari, etc.) `status === "pending"` can
  // come from wagmi's own reconnect-on-mount, and surfacing it as
  // "Connecting to MiniPay…" was the production bug Mike hit.
  const isConnecting = isInMinipay && status === "pending";
  const [connectFailed, setConnectFailed] = useState(false);
  const attemptedRef = useRef(false);

  const doConnect = useCallback(() => {
    const minipay = connectors.find((c) => c.id === "minipay");
    if (minipay) connect({ connector: minipay });
  }, [connectors, connect]);

  useEffect(() => {
    if (!isInMinipay || isConnected) return;
    if (status === "pending") return;
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    doConnect();
  }, [isInMinipay, isConnected, status, doConnect]);

  // Timeout watchdog. Only arms while we're actively trying to
  // connect inside MiniPay. Clears the moment we succeed, leave the
  // pending state, or unmount. If it fires, callers can show the
  // retry surface.
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

  const retry = useCallback(() => {
    setConnectFailed(false);
    attemptedRef.current = false;
    doConnect();
  }, [doConnect]);

  return {
    isInMinipay,
    address,
    isConnected,
    isConnecting,
    connectFailed,
    retry,
  };
}
