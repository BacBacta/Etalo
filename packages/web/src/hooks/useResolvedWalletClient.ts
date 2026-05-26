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
    try {
      const refetched = await refetch();
      if (refetched.data) return refetched.data;
    } catch {
      // Swallow refetch errors and fall through to the direct path.
    }
    if (typeof window === "undefined" || !address) return null;
    const eth = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return null;
    return createWalletClient({
      chain: etaloChain,
      transport: custom(eth),
      account: address,
    });
  }, [walletClient, refetch, address]);

  return { walletClient, resolve };
}
