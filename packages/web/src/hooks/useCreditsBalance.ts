"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import {
  fetchCreditsBalance,
  type CreditsBalanceResponse,
} from "@/lib/marketing-api";

/** Lightweight SWR-style hook for the /sellers/me/credits/balance
 * endpoint. Fetches on mount when the wallet address is available, and
 * exposes a `refetch` callback so callers can refresh after mutations
 * (e.g. after a successful generate-image consumes 1 credit, or after
 * an on-chain CreditsPurchased lands and the indexer mirrors it). */
export function useCreditsBalance() {
  const { address } = useAccount();
  const [data, setData] = useState<CreditsBalanceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCreditsBalance(address);
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch credits balance",
      );
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    balance: data?.balance ?? 0,
    walletAddress: data?.wallet_address,
    loading,
    error,
    refetch,
  };
}
