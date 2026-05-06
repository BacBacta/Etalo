/**
 * Vitest specs for useAnalyticsSummary (J10-V5 Phase 4 Block 5
 * sub-block 5.3).
 *
 * Single responsibility under test post Phase 5 Angle C sub-block C.3
 * (ADR-041 defensive shim removed, backend Literal enum is now the
 * source of truth) :
 *   - Decimal-as-JSON-string → number conversion across every monetary
 *     field on AnalyticsSummary (revenue h24/d7/d30, timeline_7d
 *     entries, escrow in_escrow/released, top_products revenue_usdt).
 *
 * Plus the standard TanStack Query gating + error propagation contract
 * (queryFn is suppressed until walletAddress is defined; thrown
 * fetchAnalyticsSummary errors land on `error` / `isError`) and a
 * passthrough sanity check for the 3 backend Literal badge values.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAnalyticsSummary } from "@/hooks/useAnalyticsSummary";
import type { AnalyticsSummary } from "@/lib/analytics-api";

const fetchAnalyticsSummaryMock = vi.fn();

vi.mock("@/lib/analytics-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/analytics-api")
  >("@/lib/analytics-api");
  return {
    ...actual,
    fetchAnalyticsSummary: (...args: unknown[]) =>
      fetchAnalyticsSummaryMock(...args),
  };
});

const SAMPLE_WALLET = "0xabc0000000000000000000000000000000000001";

// Helper — fresh QueryClient per test so cache from one spec never
// leaks into another. The hook's per-query `retry: 1` overrides any
// QueryClient default, so the error spec uses waitFor with extra
// timeout rather than disabling retries here.
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

function makeRawSummary(
  overrides: Partial<AnalyticsSummary> = {},
): AnalyticsSummary {
  // Backend Decimal fields ship as JSON strings — fixtures mirror
  // that so the selector parseFloat path is exercised end-to-end.
  return {
    revenue: {
      h24: "70.500000",
      d7: "210.300000",
      d30: "840.100000",
      timeline_7d: [
        { date: "2026-04-25", revenue_usdt: "0" },
        { date: "2026-04-26", revenue_usdt: "12.345" },
        { date: "2026-04-27", revenue_usdt: "0" },
        { date: "2026-04-28", revenue_usdt: "25.500000" },
        { date: "2026-04-29", revenue_usdt: "0" },
        { date: "2026-04-30", revenue_usdt: "100.000000" },
        { date: "2026-05-01", revenue_usdt: "70.500000" },
      ],
    },
    active_orders: 2,
    escrow: { in_escrow: "100", released: "50" },
    reputation: {
      score: 0,
      badge: "new_seller",
      auto_release_days: 3,
    },
    top_products: [
      {
        product_id: "11111111-1111-1111-1111-111111111111",
        title: "Top Product A",
        revenue_usdt: "30.500000",
        image_ipfs_hash: "QmTopA",
      },
    ],
    ...overrides,
  } as AnalyticsSummary;
}

beforeEach(() => {
  fetchAnalyticsSummaryMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useAnalyticsSummary — gating", () => {
  it("does NOT fire the query when walletAddress is undefined", () => {
    const { result } = renderHook(() => useAnalyticsSummary(undefined), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchAnalyticsSummaryMock).not.toHaveBeenCalled();
  });

  it("fires the query exactly once when walletAddress is present", async () => {
    fetchAnalyticsSummaryMock.mockResolvedValue(makeRawSummary());
    const { result } = renderHook(
      () => useAnalyticsSummary(SAMPLE_WALLET),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchAnalyticsSummaryMock).toHaveBeenCalledTimes(1);
    expect(fetchAnalyticsSummaryMock).toHaveBeenCalledWith(SAMPLE_WALLET);
  });
});

describe("useAnalyticsSummary — Decimal selector", () => {
  it("parses revenue h24/d7/d30 strings into numbers", async () => {
    fetchAnalyticsSummaryMock.mockResolvedValue(makeRawSummary());
    const { result } = renderHook(
      () => useAnalyticsSummary(SAMPLE_WALLET),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data.revenue.h24).toBe(70.5);
    expect(data.revenue.d7).toBe(210.3);
    expect(data.revenue.d30).toBe(840.1);
  });

  it("parses each timeline_7d entry's revenue_usdt string into a number", async () => {
    fetchAnalyticsSummaryMock.mockResolvedValue(makeRawSummary());
    const { result } = renderHook(
      () => useAnalyticsSummary(SAMPLE_WALLET),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data.revenue.timeline_7d).toHaveLength(7);
    expect(data.revenue.timeline_7d[1].revenue_usdt).toBe(12.345);
    expect(data.revenue.timeline_7d[3].revenue_usdt).toBe(25.5);
    // Date strings pass through untouched (Decimal-only conversion).
    expect(data.revenue.timeline_7d[1].date).toBe("2026-04-26");
  });

  it("parses escrow in_escrow/released strings into numbers", async () => {
    fetchAnalyticsSummaryMock.mockResolvedValue(makeRawSummary());
    const { result } = renderHook(
      () => useAnalyticsSummary(SAMPLE_WALLET),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data.escrow.in_escrow).toBe(100);
    expect(data.escrow.released).toBe(50);
  });

  it("parses each top_products entry's revenue_usdt string into a number", async () => {
    fetchAnalyticsSummaryMock.mockResolvedValue(makeRawSummary());
    const { result } = renderHook(
      () => useAnalyticsSummary(SAMPLE_WALLET),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data.top_products).toHaveLength(1);
    expect(data.top_products[0].revenue_usdt).toBe(30.5);
    // Non-Decimal fields pass through.
    expect(data.top_products[0].title).toBe("Top Product A");
    expect(data.top_products[0].image_ipfs_hash).toBe("QmTopA");
  });

  it("returns numeric 0 (not NaN) when every Decimal field is the string '0'", async () => {
    fetchAnalyticsSummaryMock.mockResolvedValue(
      makeRawSummary({
        revenue: {
          h24: "0",
          d7: "0",
          d30: "0",
          timeline_7d: Array.from({ length: 7 }, (_, i) => ({
            date: `2026-04-${25 + i}`,
            revenue_usdt: "0",
          })),
        },
        escrow: { in_escrow: "0", released: "0" },
        top_products: [],
      }),
    );
    const { result } = renderHook(
      () => useAnalyticsSummary(SAMPLE_WALLET),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data.revenue.h24).toBe(0);
    expect(data.revenue.d7).toBe(0);
    expect(data.revenue.d30).toBe(0);
    for (const p of data.revenue.timeline_7d) {
      expect(p.revenue_usdt).toBe(0);
      expect(Number.isNaN(p.revenue_usdt)).toBe(false);
    }
    expect(data.escrow.in_escrow).toBe(0);
    expect(data.escrow.released).toBe(0);
    expect(data.top_products).toEqual([]);
  });
});

describe("useAnalyticsSummary — badge passthrough (Phase 5 Angle C)", () => {
  // Post-shim removal : the 3 backend Literal values pass through
  // verbatim. If a future drift adds a new value or reintroduces
  // "top_seller", this it.each block will catch it because the cast in
  // parseAnalyticsSummary is the only remaining transform.
  it.each([
    ["new_seller"] as const,
    ["active"] as const,
    ["suspended"] as const,
  ])("badge '%s' from backend passes through unchanged", async (input) => {
    fetchAnalyticsSummaryMock.mockResolvedValue(
      makeRawSummary({
        reputation: {
          score: 0,
          badge: input,
          auto_release_days: 3,
        },
      }),
    );
    const { result } = renderHook(
      () => useAnalyticsSummary(SAMPLE_WALLET),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.reputation.badge).toBe(input);
  });
});

describe("useAnalyticsSummary — error propagation", () => {
  // The hook ships `retry: 1` for transient ngrok-tunnel blips, so the
  // error surfaces only AFTER the first retry exhausts (~1 s default
  // backoff). The waitFor timeout below covers that window with
  // headroom; the persistent mockRejectedValue ensures both calls fail.
  it("surfaces fetchAnalyticsSummary errors on `error` / `isError`", async () => {
    fetchAnalyticsSummaryMock.mockRejectedValue(
      new Error("Analytics summary fetch failed: 500"),
    );
    const { result } = renderHook(
      () => useAnalyticsSummary(SAMPLE_WALLET),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5000,
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toMatch(
      /Analytics summary fetch failed: 500/,
    );
    expect(result.current.data).toBeUndefined();
    // Initial call + 1 retry == 2 invocations.
    expect(fetchAnalyticsSummaryMock).toHaveBeenCalledTimes(2);
  });
});
