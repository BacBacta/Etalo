/**
 * Vitest specs for fetchAnalyticsSummary (J10-V5 Phase 4 Block 5
 * sub-block 5.2b).
 *
 * Covers :
 *  - URL + method + X-Wallet-Address header propagation through the
 *    fetchApi layer.
 *  - Pass-through of Decimal-as-JSON-string fields (the wrapper must
 *    NOT coerce them to number — that's the selector's job in 5.3).
 *  - Error path : non-2xx responses throw a descriptive Error so the
 *    TanStack Query hook (5.3) can surface the failure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchAnalyticsSummary,
  type AnalyticsSummary,
} from "@/lib/analytics-api";

const SAMPLE_WALLET = "0xabc0000000000000000000000000000000000001";

// Mirrors the shape the backend ships (sub-block 5.2a). Decimal fields
// are JSON strings, dates are ISO date strings.
const SAMPLE_RESPONSE: AnalyticsSummary = {
  // Decimal fields are typed as `string` in api.gen.ts (FastAPI ships
  // Pydantic Decimal as JSON string — sub-block 5.2a's contract test
  // pins this). Fixtures use plain strings to mirror the wire shape.
  revenue: {
    h24: "12.50",
    d7: "75.30",
    d30: "240.10",
    timeline_7d: [
      { date: "2026-04-25", revenue_usdt: "0" },
      { date: "2026-04-26", revenue_usdt: "10.00" },
      { date: "2026-04-27", revenue_usdt: "0" },
      { date: "2026-04-28", revenue_usdt: "25.50" },
      { date: "2026-04-29", revenue_usdt: "0" },
      { date: "2026-04-30", revenue_usdt: "27.30" },
      { date: "2026-05-01", revenue_usdt: "12.50" },
    ],
  },
  active_orders: 3,
  escrow: {
    in_escrow: "180.00",
    released: "60.10",
  },
  reputation: {
    score: 42,
    badge: "active",
    auto_release_days: 3,
  },
  top_products: [
    {
      product_id: "11111111-1111-1111-1111-111111111111",
      title: "Top Product A",
      revenue_usdt: "120.00",
      image_ipfs_hash: "QmTest1",
    },
  ],
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAnalyticsSummary", () => {
  it("calls GET /analytics/summary with the X-Wallet-Address header", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }),
    );

    await fetchAnalyticsSummary(SAMPLE_WALLET);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // fetchApi appends the path to NEXT_PUBLIC_API_URL or its
    // server/client default; the suffix is what we own here.
    expect(url).toMatch(/\/analytics\/summary$/);
    // No explicit method override → defaults to GET.
    expect(init.method ?? "GET").toBe("GET");
    const headers = new Headers(init.headers);
    expect(headers.get("X-Wallet-Address")).toBe(SAMPLE_WALLET);
    // ngrok-skip-browser-warning is auto-injected by fetchApi — proof
    // that the wrapper is going through fetchApi (not raw fetch).
    expect(headers.get("ngrok-skip-browser-warning")).toBe("any");
  });

  it("returns the JSON body verbatim — Decimal strings stay strings", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }),
    );

    const result = await fetchAnalyticsSummary(SAMPLE_WALLET);

    // Pass-through assertion : the wrapper must NOT parseFloat the
    // Decimal fields. Selector responsibility lands in sub-block 5.3.
    expect(result.revenue.h24).toBe("12.50");
    expect(result.revenue.timeline_7d[3].revenue_usdt).toBe("25.50");
    expect(result.escrow.in_escrow).toBe("180.00");
    expect(result.top_products[0].revenue_usdt).toBe("120.00");
    // Non-Decimal fields pass through untouched too.
    expect(result.active_orders).toBe(3);
    expect(result.reputation.badge).toBe("active");
  });

  it("throws a descriptive Error on non-2xx responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "unauthorized" }), {
        status: 401,
      }),
    );

    await expect(fetchAnalyticsSummary(SAMPLE_WALLET)).rejects.toThrow(
      /Analytics summary fetch failed: 401/,
    );
  });
});
