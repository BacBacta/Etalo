/**
 * Analytics API client — J10-V5 Phase 4 Block 5 sub-block 5.2b.
 *
 * Thin typed wrapper around the GET /api/v1/analytics/summary endpoint
 * exposed by the backend (sub-block 5.2a). The hook layer
 * (useAnalyticsSummary, sub-block 5.3) is the place where the Decimal
 * JSON-string fields get parseFloat'd into chart-ready numbers — this
 * file deliberately returns the raw backend shape so a future SSR
 * dehydrate boundary can pass it across the wire without re-parsing.
 *
 * Pattern matches marketing-api.ts / seller-api.ts :
 *   - fetchApi (not raw fetch) handles NEXT_PUBLIC_API_URL resolution +
 *     auto-injects the `ngrok-skip-browser-warning` header for the
 *     ngrok-tunnelled MiniPay Developer Mode workflow.
 *   - Caller passes walletAddress; the function builds the
 *     `X-Wallet-Address` header inline (ADR-036 dev-mode auth ; ADR-034
 *     forbids signed messages for backend reads in V1).
 *   - Throws a descriptive Error on any non-2xx so the TanStack Query
 *     hook (5.3) surfaces it through its native error channel.
 */
import { fetchApi } from "@/lib/fetch-api";
import type { components } from "@/types/api.gen";

export type AnalyticsSummary = components["schemas"]["AnalyticsSummary"];

export async function fetchAnalyticsSummary(
  walletAddress: string,
): Promise<AnalyticsSummary> {
  const res = await fetchApi("/analytics/summary", {
    headers: { "X-Wallet-Address": walletAddress },
  });
  if (!res.ok) {
    throw new Error(`Analytics summary fetch failed: ${res.status}`);
  }
  return (await res.json()) as AnalyticsSummary;
}
