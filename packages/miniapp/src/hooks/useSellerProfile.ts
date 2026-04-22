import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { useMinipay } from "@/hooks/useMinipay";

export interface SellerProfile {
  id: string;
  shop_handle: string;
  shop_name: string;
  description: string | null;
  logo_ipfs_hash: string | null;
  banner_ipfs_hash: string | null;
  socials: Record<string, string> | null;
  categories: string[] | null;
  created_at: string;
}

interface SellersMeResponse {
  profile: SellerProfile | null;
}

/**
 * Fetch the connected wallet's seller profile.
 *
 * Returns `{ data: { profile: null } }` when the user has no profile
 * yet — callers should treat that as "route to onboarding".
 */
export function useSellerProfile() {
  const { address, isConnected } = useMinipay();

  return useQuery({
    queryKey: ["sellers", "me", address],
    queryFn: () =>
      apiFetch<SellersMeResponse>("/sellers/me", {
        wallet: address!,
      }),
    enabled: isConnected && Boolean(address),
    staleTime: 60_000,
  });
}
