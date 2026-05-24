/**
 * SilentReconnectGate — silent wallet reconnect on page mount.
 *
 * Replaces wagmi's default `reconnectOnMount` behaviour which, on some
 * browser/wallet combinations, surfaces a permission prompt the user
 * never asked for. That prompt propagated as "User rejected the
 * request" if the user clicked Reject and bubbled to the global
 * error boundary as "Something went wrong" (PR #36 root cause).
 *
 * Contract :
 *  - WagmiProvider gets `reconnectOnMount={false}` so wagmi never
 *    fires its own reconnect attempt.
 *  - This gate, mounted once at the app root in AppProviders,
 *    asks the injected provider directly via `eth_accounts` — the
 *    SILENT RPC method that returns approved accounts without
 *    prompting (`[]` if nothing is approved for this origin).
 *  - If accounts come back non-empty, we call wagmi's `connect()`
 *    with the matching connector ; the call resolves without UI
 *    popup because the origin is already approved.
 *  - If empty, we do nothing — the user must trigger connect
 *    explicitly (Chrome path) OR the route's `useMinipay()` hook
 *    will fire the MiniPay handshake (MiniPay path).
 *
 * Important — this gate does NOT cover the MiniPay first-visit
 * handshake. That is owned exclusively by `useMinipay()` which is
 * mounted on every surface that gates UX on a wallet (seller
 * dashboard, /orders, RequireWallet, useOrderInitiate, …). Having
 * two surfaces fire `connect()` concurrently raced wagmi's internal
 * state and stuck `status: pending` indefinitely (user-report bug
 * 2026-05-23) — the silent-only contract here keeps the surfaces
 * non-overlapping.
 */
"use client";

import { useEffect, useRef } from "react";
import { useAccount, useConnect } from "wagmi";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMiniPay?: boolean;
}

function getEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

export function SilentReconnectGate() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  // Single-shot guard — reconnect fires AT MOST once per page load.
  // Subsequent re-renders (state updates, route changes within the
  // (app) group) must not re-trigger the probe.
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    if (isConnected) {
      attemptedRef.current = true;
      return;
    }
    const eth = getEthereum();
    if (!eth) {
      attemptedRef.current = true;
      return;
    }
    attemptedRef.current = true;

    const isRealMinipay = eth.isMiniPay === true;
    const target = isRealMinipay
      ? connectors.find((c) => c.id === "minipay")
      : (connectors.find(
          (c) =>
            c.type === "injected" &&
            c.id !== "injected" &&
            c.id !== "minipay" &&
            c.id !== "walletConnect",
        ) ??
        connectors.find((c) => c.id === "injected"));
    if (!target) return;

    eth
      .request({ method: "eth_accounts" })
      .then((result) => {
        const accounts = Array.isArray(result) ? (result as string[]) : [];
        if (accounts.length === 0) return;
        // Origin already approved — silent connect with no popup.
        connect({ connector: target });
      })
      .catch(() => {
        // Provider rejected eth_accounts — silent no-op. The user
        // can still tap Connect (Chrome) or the route's useMinipay()
        // will drive the handshake (MiniPay).
      });
  }, [isConnected, connect, connectors]);

  return null;
}
