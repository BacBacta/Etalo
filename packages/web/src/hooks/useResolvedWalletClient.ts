"use client";

import { useCallback } from "react";
import {
  createWalletClient,
  custom,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { etaloChain } from "@/lib/chain";

/**
 * Returns a function that resolves a `WalletClient` even when wagmi's
 * async `useWalletClient` hasn't materialized yet.
 *
 * Why this exists : in MiniPay's WebView, `useAccount()` reports the
 * connected address synchronously from the wagmi store, but
 * `useWalletClient()` (a `useQuery` wrapper that calls
 * `connector.getProvider()` and builds a viem client) can stay
 * `undefined` for an unbounded time. Hooks that gate a writeContract
 * call on `walletClient.data` bail silently and the user is stuck
 * with no error — that's the J12 mainnet smoke bug surfaced by PR
 * #103.
 *
 * Resolution order (called on demand from an action handler, never at
 * render time) :
 *
 *  1. `walletClient.data` from wagmi — happy path on every session
 *     that's had even a moment to settle.
 *  2. `useWalletClient().refetch()` — forces wagmi to re-run
 *     `getWalletClient` against the connector ; covers the race where
 *     the user clicked before wagmi finished its initial async build.
 *  3. `createWalletClient({ transport: custom(window.ethereum), … })`
 *     — bypasses wagmi entirely. MiniPay always injects a provider
 *     inside its WebView, and the connector flag was already true
 *     when address resolved, so this changes the wrapper, not the
 *     wallet semantics.
 *
 * Returns `null` only if the user genuinely has no wallet (no
 * `window.ethereum`, no address). Consumers should surface a
 * user-facing error in that case.
 *
 * Usage :
 *   const { resolve } = useResolvedWalletClient();
 *   const wc = await resolve();
 *   if (!wc) { toast.error("Wallet not connected"); return; }
 *   await wc.writeContract({ ... });
 */
export function useResolvedWalletClient() {
  const { data: walletClient, refetch } = useWalletClient();
  const { address } = useAccount();

  const resolve = useCallback(async (): Promise<WalletClient | null> => {
    if (walletClient) return walletClient;

    // First refetch — covers the wagmi-initial-async race on every
    // session (PR #103). Fast path : usually returns the client here.
    try {
      const refetched = await refetch();
      if (refetched.data) return refetched.data;
    } catch {
      // Swallow refetch errors and fall through.
    }

    // Direct injected fallback — works in MiniPay's WebView and in any
    // injected-wallet browser (MetaMask, Rabby, …). Skipped silently
    // when no `window.ethereum` exists (e.g. WalletConnect on desktop
    // Chrome), so the WC path retries refetch below instead of bailing.
    if (typeof window !== "undefined" && address) {
      const eth = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
      if (eth) {
        return createWalletClient({
          chain: etaloChain,
          transport: custom(eth),
          account: address,
        });
      }
    }

    // No injected provider — WalletConnect path. wagmi's
    // `getWalletClient` against the WC connector can take a moment to
    // materialize after the user signs in their mobile wallet ; retry
    // refetch with a small backoff before giving up.
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      try {
        const refetched = await refetch();
        if (refetched.data) return refetched.data;
      } catch {
        // Continue to the next attempt.
      }
    }

    if (process.env.NODE_ENV !== "production") {
      // Dev-mode diagnostic so the next failure surfaces exactly which
      // input was missing instead of a silent null.
      // eslint-disable-next-line no-console
      console.warn("[useResolvedWalletClient] resolve returned null", {
        hasCachedWalletClient: Boolean(walletClient),
        hasAddress: Boolean(address),
        hasInjectedEthereum:
          typeof window !== "undefined" &&
          Boolean(
            (window as Window & { ethereum?: EIP1193Provider }).ethereum,
          ),
      });
    }
    return null;
  }, [walletClient, refetch, address]);

  return { walletClient, resolve };
}
