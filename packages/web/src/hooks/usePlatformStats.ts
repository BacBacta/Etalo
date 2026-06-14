import { useQuery } from "@tanstack/react-query";

import { fetchPlatformStats, type PlatformStats } from "@/lib/stats-api";

export function usePlatformStats() {
  return useQuery<PlatformStats, Error>({
    queryKey: ["platform-stats"],
    queryFn: fetchPlatformStats,
    staleTime: 60_000,
    retry: 1,
  });
}
