"use client";

/**
 * useCreditsBalance — TanStack Query hook over GET
 * /sellers/me/credits/balance (J10-V5 Phase 5 polish item B).
 *
 * 6th codebase consumer of TanStack Query (after useAnalyticsSummary,
 * useOrderInitiate, useCheckout, useMilestoneOnce,
 * useMarketplaceProducts). Replaces the previous useState + useEffect
 * + manual `refetch()` plumbing so post-purchase indexer-lag polling
 * can fire `queryClient.invalidateQueries(...)` instead of imperative
 * setData/setLoading dances.
 *
 * The wallet address is read from wagmi's useAccount inside the hook
 * so consumers don't have to thread it ; the queryKey carries it for
 * cache scoping (different wallets get different caches when MiniPay
 * lets the user switch accounts mid-session). `enabled: Boolean(address)`
 * suppresses the fetch until wagmi resolves an address.
 *
 * staleTime 30 s + retry 1 mirrors useAnalyticsSummary so the seller
 * dashboard tabs feel consistent : a fresh purchase invalidates
 * (forces a refetch immediately), but tab-switches inside the cache
 * window stay cheap.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAccount } from "wagmi";

import {
  fetchCreditsBalance,
  type CreditsBalanceResponse,
} from "@/lib/marketing-api";

export const CREDITS_BALANCE_QUERY_KEY = "credits-balance" as const;

export function useCreditsBalance() {
  const { address } = useAccount();
  return useQuery<CreditsBalanceResponse, Error>({
    queryKey: [CREDITS_BALANCE_QUERY_KEY, address],
    queryFn: () => fetchCreditsBalance(address as string),
    enabled: Boolean(address),
    staleTime: 30_000,
    retry: 1,
  });
}

// Reconciliation poll cadence — the indexer mirrors the on-chain
// CreditsPurchased event within a few seconds; we poll a touch beyond
// that so the optimistic value self-corrects without flashing 0.
const RECONCILE_INTERVAL_MS = 2_000;
const RECONCILE_MAX_ATTEMPTS = 15; // ~30s ceiling

/**
 * useReconcileCreditsBalance — eliminates the "flash of 0 / stale balance"
 * after an on-chain credit purchase.
 *
 * On-chain → off-chain mirror lag means the balance endpoint still
 * returns the pre-purchase value for a few seconds after the tx confirms.
 * A plain invalidate therefore refetches that stale value and the chip
 * shows 0. Instead we:
 *   1. optimistically bump the cached balance by the purchased amount so
 *      the UI updates instantly, then
 *   2. poll the server in the background, KEEPING the optimistic value
 *      until the indexer catches up (server balance ≥ optimistic), at
 *      which point we adopt the authoritative value. A max-attempts
 *      ceiling adopts whatever the server returns so we never hang.
 */
export function useReconcileCreditsBalance() {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  return useCallback(
    (purchasedCredits: number) => {
      if (!address || purchasedCredits <= 0) return;
      const key = [CREDITS_BALANCE_QUERY_KEY, address];

      const current =
        queryClient.getQueryData<CreditsBalanceResponse>(key);
      const optimistic = (current?.balance ?? 0) + purchasedCredits;
      queryClient.setQueryData<CreditsBalanceResponse>(key, (old) =>
        old
          ? { ...old, balance: optimistic }
          : { balance: optimistic, wallet_address: address },
      );

      let attempts = 0;
      const tick = async () => {
        attempts += 1;
        try {
          const fresh = await fetchCreditsBalance(address);
          // Indexer caught up (or ceiling hit) → adopt authoritative value.
          if (fresh.balance >= optimistic || attempts >= RECONCILE_MAX_ATTEMPTS) {
            queryClient.setQueryData(key, fresh);
            return;
          }
          // Still stale → keep the optimistic value, retry.
        } catch {
          // Network blip → keep optimistic, retry until the ceiling.
          if (attempts >= RECONCILE_MAX_ATTEMPTS) return;
        }
        window.setTimeout(tick, RECONCILE_INTERVAL_MS);
      };
      window.setTimeout(tick, RECONCILE_INTERVAL_MS);
    },
    [address, queryClient],
  );
}
