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
import { useQuery } from "@tanstack/react-query";
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
