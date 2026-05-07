/**
 * useBuyerCountry — Sprint J11.7 Block 5 (ADR-045).
 *
 * TanStack Query wrapper for the User row of the connected wallet.
 * Returns the buyer's country (and other User-level fields) or null
 * when the wallet has no User row yet (first visit). Mirrors
 * useBuyerOrders / useAnalyticsSummary pattern.
 *
 * Pair with the `setMyCountry` mutation hook below for the prompt
 * banner UX.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchMyUser,
  updateMyUser,
  type BuyerCountryUpdate,
  type UserMe,
} from "@/lib/buyer-country";

export const BUYER_USER_QUERY_KEY = "buyer-user";

export interface UseBuyerCountryArgs {
  wallet: string | undefined;
  enabled?: boolean;
}

export function useBuyerCountry({
  wallet,
  enabled = true,
}: UseBuyerCountryArgs) {
  return useQuery<UserMe | null, Error>({
    queryKey: [BUYER_USER_QUERY_KEY, wallet?.toLowerCase()],
    queryFn: () => {
      if (!wallet) throw new Error("wallet address required");
      return fetchMyUser(wallet);
    },
    enabled: enabled && Boolean(wallet),
    staleTime: 60_000,
    retry: 1,
  });
}

export interface UseSetMyCountryArgs {
  wallet: string | undefined;
}

export function useSetMyCountry({ wallet }: UseSetMyCountryArgs) {
  const qc = useQueryClient();
  return useMutation<UserMe, Error, BuyerCountryUpdate>({
    mutationFn: (payload) => {
      if (!wallet) throw new Error("wallet address required");
      return updateMyUser(wallet, payload);
    },
    onSuccess: (data) => {
      // Update cache so consumers re-render with the new country.
      qc.setQueryData<UserMe | null>(
        [BUYER_USER_QUERY_KEY, wallet?.toLowerCase()],
        data,
      );
    },
  });
}
