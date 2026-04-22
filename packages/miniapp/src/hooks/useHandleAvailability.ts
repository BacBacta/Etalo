import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { useMinipay } from "@/hooks/useMinipay";

interface HandleAvailabilityResponse {
  handle: string;
  available: boolean;
  reason: "format" | "taken" | null;
}

/**
 * Debounced handle-availability check.
 *
 * Typing immediately — debounce 400ms — fire the backend check. Returns
 * `status` that the UI can render as an inline indicator (spinner when
 * `checking`, check when `available`, red X when `taken` or `format`).
 */
export function useHandleAvailability(rawHandle: string) {
  const { address } = useMinipay();
  const [debounced, setDebounced] = useState(rawHandle);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(rawHandle), 400);
    return () => clearTimeout(t);
  }, [rawHandle]);

  const q = useQuery({
    queryKey: ["handle-available", debounced, address],
    queryFn: () =>
      apiFetch<HandleAvailabilityResponse>(
        `/sellers/handle-available/${encodeURIComponent(debounced)}`,
        { wallet: address! },
      ),
    enabled: Boolean(address) && debounced.length >= 3,
    staleTime: 30_000,
  });

  if (!address || rawHandle.length < 3) return { status: "idle" as const };
  if (rawHandle !== debounced) return { status: "debouncing" as const };
  if (q.isPending) return { status: "checking" as const };
  if (q.isError) return { status: "error" as const };
  if (q.data?.available) return { status: "available" as const };
  return { status: "unavailable" as const, reason: q.data?.reason };
}
