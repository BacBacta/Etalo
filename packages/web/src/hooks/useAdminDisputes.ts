/**
 * useAdminDisputes — read /admin/disputes (ADR-056) for the triage page.
 *
 * Sends the bearer token from useAdminToken as X-Admin-Token. Disabled
 * until a token is present so the query doesn't hammer the backend with
 * 401s on first render.
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/fetch-api";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";

export const ADMIN_DISPUTES_QUERY_KEY = "admin-disputes" as const;

export interface UseAdminDisputesOptions {
  token: string;
  /** DisputeLevel value (e.g. "N2_Mediation"). Omit for any level. */
  level?: string | null;
  /** Defaults to false (open only). null → any. */
  resolved?: boolean | null;
}

export function useAdminDisputes({
  token,
  level,
  resolved,
}: UseAdminDisputesOptions) {
  return useQuery<DisputeResponse[]>({
    queryKey: [ADMIN_DISPUTES_QUERY_KEY, token, level ?? null, resolved ?? null],
    enabled: !!token,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (level) params.set("level", level);
      if (resolved !== null && resolved !== undefined) {
        params.set("resolved", String(resolved));
      }
      const qs = params.toString();
      const res = await fetchApi(`/admin/disputes${qs ? `?${qs}` : ""}`, {
        headers: { "X-Admin-Token": token },
      });
      if (!res.ok) {
        throw new Error(`Admin disputes fetch failed: ${res.status}`);
      }
      return (await res.json()) as DisputeResponse[];
    },
  });
}
