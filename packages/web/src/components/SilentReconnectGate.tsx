/**
 * SilentReconnectGate — wallet auto-connect on page mount.
 *
 * Two contracts in one component, picked by MiniPay context :
 *
 * 1. MiniPay (real WebView OR Mini App Test developer mode, lenient
 *    detection via isMiniPay flag / UA / ngrok / FORCE_MINIPAY env) :
 *    AGGRESSIVE auto-connect. Per the official MiniPay readiness
 *    requirements (celopedia-skills minipay-requirements.md §1 +
 *    https://docs.minipay.xyz/getting-started/wallet-connection.html)
 *    every Mini App MUST zero-click connect — no Connect Wallet button,
 *    auto-retrieve the address from window.ethereum. This means calling
 *    `connect()` unconditionally on mount, not waiting for `eth_accounts`
 *    to already return approved accounts.
 *
 * 2. Outside MiniPay (regular Chrome / Safari / mobile browser) :
 *    SILENT reconnect only. We probe `eth_accounts` (the no-prompt RPC
 *    method) and only connect if the origin already had accounts
 *    approved. Surfacing a connect popup the user didn't initiate is
 *    the bug PR #36 fixed ("User rejected the request" surfaced as a
 *    crash UX). The explicit Connect button stays for first-time users.
 *
 * Replaces wagmi's default `reconnectOnMount` behavior (disabled in
 * Providers.tsx) which on some browser/wallet combinations would pop
 * a permission prompt the user never asked for.
 *
 * Hardening :
 *  - Retries on dep changes (connectors, isConnected) until the auto-
 *    connect attempt actually fires. Avoids the trap where the first
 *    effect runs before wagmi's EIP-6963 discovery has populated
 *    `connectors` with a usable injected provider, or before MiniPay's
 *    WebView has finished injecting `window.ethereum`.
 *  - Single-shot lock flips ONLY after a real connect() call ; if we
 *    bailed out for missing inputs the next dep tick gets another go.
 *  - In MiniPay context, also polls window.ethereum for up to ~2 s in
 *    case the WebView injects the provider a beat late.
 */
"use client";

import { useEffect, useRef } from "react";
import { useAccount, useConnect } from "wagmi";

import { detectMiniPay } from "@/lib/minipay-detect";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMiniPay?: boolean;
}

function getEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

// Wait up to `timeoutMs` for window.ethereum to be present (MiniPay
// WebView injection can lag behind first React effect by a few
// hundred ms on slower Android devices). Polls at 100 ms.
function waitForEthereum(timeoutMs = 2000): Promise<EthereumProvider | undefined> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const eth = getEthereum();
      if (eth) return resolve(eth);
      if (Date.now() - start >= timeoutMs) return resolve(undefined);
      setTimeout(tick, 100);
    };
    tick();
  });
}

export function SilentReconnectGate() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  // Lock flips true ONLY after a real connect() call. If a render
  // bails out (no eth yet, no connector yet) the lock stays open so
  // the next dep tick retries.
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || isConnected) return;

    const isInMinipay = detectMiniPay();

    const pickTarget = (eth: EthereumProvider) => {
      // Real MiniPay (canonical flag present) → dedicated `minipay`
      // connector. Anything else → prefer EIP-6963-specific (e.g.
      // `io.metamask`) then fall back to the generic `injected`
      // connector. Covers Chrome + MiniPay "Mini App Test" mode where
      // the WebView injects window.ethereum but does NOT set isMiniPay.
      if (eth.isMiniPay === true) {
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
    };

    const run = async () => {
      // MiniPay context : zero-click auto-connect per the readiness
      // requirements doc. Poll for the WebView's provider to appear
      // since injection can lag the first effect.
      if (isInMinipay) {
        const eth = await waitForEthereum(2000);
        if (!eth) return; // leave firedRef open, retry on next dep tick
        const target = pickTarget(eth);
        if (!target) return; // wait for EIP-6963 discovery on next tick
        firedRef.current = true;
        connect({ connector: target });
        return;
      }

      // Non-MiniPay : silent probe only, never popup-trigger.
      const eth = getEthereum();
      if (!eth) {
        firedRef.current = true; // no provider, nothing to do
        return;
      }
      const target = pickTarget(eth);
      if (!target) return;

      try {
        const result = await eth.request({ method: "eth_accounts" });
        const accounts = Array.isArray(result) ? (result as string[]) : [];
        firedRef.current = true;
        if (accounts.length > 0) {
          connect({ connector: target });
        }
      } catch {
        firedRef.current = true;
      }
    };

    void run();
  }, [isConnected, connect, connectors]);

  return null;
}
