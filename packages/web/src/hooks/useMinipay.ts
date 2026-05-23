import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useConnect } from "wagmi";

import { detectMiniPay } from "@/lib/minipay-detect";

// Hard ceiling on the "Connecting to MiniPay…" surface. 8 s comfortably
// above the p95 connect time observed in MiniPay Test mode ; if the
// auto-connect hasn't resolved by then, callers can render Retry.
const CONNECT_TIMEOUT_MS = 8_000;

/**
 * MiniPay auto-connect hook (restored from reverted commit 8f56b91).
 *
 * Owns the on-mount `connect()` side-effect for any surface that
 * gates the user experience on a wallet being present (the seller
 * dashboard, /orders, RequireWallet, useOrderInitiate, …). Mounting
 * this hook is what makes MiniPay's WebView provider actually
 * register with wagmi — without it, `window.ethereum` sits there and
 * `useAccount().isConnected` never flips true.
 *
 * `SilentReconnectGate` (in Providers.tsx) is the COMPLEMENTARY
 * surface for non-MiniPay returning sessions (Chrome with a prior
 * MetaMask approval, etc.) ; it probes `eth_accounts` silently and
 * connects only if accounts are already approved for the origin.
 * It deliberately does NOT cover MiniPay — `useMinipay` is the
 * single owner of the MiniPay handshake (avoids the race where
 * both surfaces fire `connect()` concurrently and wagmi gets stuck
 * in `status: pending` — user-report production bug 2026-05-23).
 *
 * Per CLAUDE.md rule 7 + MiniPay readiness requirements §1 (Zero-
 * Click Connect), MiniPay surfaces MUST NOT render a Connect button.
 * Callers render `<DashboardSkeleton />` (or equivalent) while
 * `isConnecting`, and a Retry-only surface (NO Connect button) when
 * `connectFailed` flips.
 *
 * Returns `{ isInMinipay, isStrictMinipay, address, isConnected,
 * isConnecting, connectFailed, retry }`.
 */
export function useMinipay() {
  const { connect, connectors, status } = useConnect();
  const { address, isConnected } = useAccount();

  const isInMinipay = detectMiniPay();
  // Strict detection — canonical `isMiniPay` flag present on
  // window.ethereum. Exposed for callers / debug panels ; not used
  // to gate behaviour here (the connector picker checks the flag
  // again at call time to pick the right connector).
  const isStrictMinipay =
    typeof window !== "undefined" &&
    (window as Window & { ethereum?: { isMiniPay?: boolean } }).ethereum
      ?.isMiniPay === true;
  // Only treat the wagmi pending status as MiniPay-in-flight when we
  // ARE in MiniPay — otherwise the same `pending` from wagmi's own
  // reconnect-on-mount would surface "Connecting to MiniPay…" on
  // non-MiniPay users (the bug PR #38 fixed by gating this).
  const isConnecting = isInMinipay && status === "pending";
  const [connectFailed, setConnectFailed] = useState(false);
  // We retry on connector-list changes (wagmi populates EIP-6963
  // connectors async) until a real connect() call lands. `firedRef`
  // flips true ONLY after we successfully fire connect with a valid
  // target — bail paths (no target yet, status already pending)
  // leave it open so the next dep tick gets another chance.
  const firedRef = useRef(false);

  // Pick the connector that can accept window.ethereum. Real MiniPay
  // (canonical `isMiniPay` flag set) → strict `minipay` connector.
  // Anything else (MiniPay Test mode WITHOUT the flag, ngrok dev
  // tunnel, Chrome / Trust / MetaMask in MiniPay-detected context)
  // → prefer EIP-6963-specific then fall back to the generic
  // `injected` connector. Same logic mirrored in SilentReconnectGate
  // for the non-MiniPay path.
  const pickTarget = useCallback(() => {
    const strict =
      typeof window !== "undefined" &&
      (window as Window & { ethereum?: { isMiniPay?: boolean } }).ethereum
        ?.isMiniPay === true;
    if (strict) {
      return connectors.find((c) => c.id === "minipay");
    }
    return (
      connectors.find(
        (c) =>
          c.type === "injected" &&
          c.id !== "injected" &&
          c.id !== "minipay" &&
          c.id !== "walletConnect",
      ) ?? connectors.find((c) => c.id === "injected")
    );
  }, [connectors]);

  // Auto-connect on mount inside MiniPay. Retries on dep changes
  // (connectors list updates, isInMinipay flips client-side) until
  // a real connect call fires.
  useEffect(() => {
    if (firedRef.current) return;
    if (!isInMinipay || isConnected) return;
    if (status === "pending") return;
    const target = pickTarget();
    if (!target) return; // wait for connectors to populate
    firedRef.current = true;
    connect({ connector: target });
  }, [isInMinipay, isConnected, status, pickTarget, connect]);

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
