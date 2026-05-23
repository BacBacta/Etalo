import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useConnect } from "wagmi";

import { detectMiniPay } from "@/lib/minipay-detect";

// Hard ceiling on the "Connecting to MiniPay…" surface. 3 s — long
// enough for a healthy production auto-connect (typically 50-300 ms)
// to land, short enough that a stuck user gets the manual escape
// surface fast. Was 8 s but stuck-state observed in MiniPay Test
// mode (WebView refuses non-user-gesture eth_requestAccounts and
// `connect()` never rejects either — it just hangs in pending).
const CONNECT_TIMEOUT_MS = 3_000;

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
  // Strict detection — does the WebView's provider actually carry the
  // canonical `isMiniPay` flag ? True ⇒ real production MiniPay
  // (eth_requestAccounts is pre-approved at the WebView level, the
  // silent auto-connect contract holds). False but `isInMinipay` true
  // ⇒ Mini App Test developer mode or ngrok tunnel : the WebView often
  // refuses to grant accounts without a user gesture, so callers
  // should surface a tap-to-connect CTA as fallback.
  const isStrictMinipay =
    typeof window !== "undefined" &&
    (window as Window & { ethereum?: { isMiniPay?: boolean } }).ethereum
      ?.isMiniPay === true;
  // Crucial : only treat the wagmi pending status as a MiniPay
  // connect-in-flight signal when we ARE in MiniPay. Outside the
  // MiniPay WebView (Chrome, Safari, etc.) `status === "pending"` can
  // come from wagmi's own reconnect-on-mount, and surfacing it as
  // "Connecting to MiniPay…" was the production bug Mike hit.
  const isConnecting = isInMinipay && status === "pending";
  const [connectFailed, setConnectFailed] = useState(false);
  const attemptedRef = useRef(false);

  const doConnect = useCallback(() => {
    // Pick the connector that can actually accept window.ethereum.
    // Real MiniPay (canonical isMiniPay flag injected) → strict
    // `minipay` connector. MiniPay "Mini App Test" developer mode +
    // ngrok dev tunnel → no flag, so the strict connector's target()
    // returns undefined ; we fall back to an EIP-6963-specific or
    // the generic `injected` connector against window.ethereum.
    // This matches the connector-picking logic in SilentReconnectGate
    // (kept in sync ; both surfaces auto-connect in Test mode per
    // MiniPay best practices + CLAUDE.md rule 7).
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
    isStrictMinipay,
    address,
    isConnected,
    isConnecting,
    connectFailed,
    retry,
  };
}
