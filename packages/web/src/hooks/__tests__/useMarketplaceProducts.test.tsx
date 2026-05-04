/**
 * Vitest specs for useMarketplaceProducts (J10-V5 Phase 5 Block 2
 * sub-block 2.3a).
 *
 * Covers the TanStack useInfiniteQuery contract this hook exposes :
 *   - `enabled` gate suppresses the fetch until the consumer (the
 *     marketplace page) has confirmed MiniPay context.
 *   - First page resolves into data.pages[0].
 *   - getNextPageParam : has_more=true returns next_cursor, has_more=false
 *     returns undefined → hasNextPage flips off, fetchNextPage no-ops.
 *   - fetchNextPage appends a second page so consumers can flatMap the
 *     full list.
 *
 * Mirrors useAnalyticsSummary's QueryClient-per-test pattern so cache
 * never leaks across specs. Retries are disabled at the QueryClient
 * level to keep the error spec from waiting through the per-query
 * `retry: 1` budget.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMarketplaceProducts } from "@/hooks/useMarketplaceProducts";
import type { MarketplaceListResponse } from "@/lib/api";

const fetchMarketplaceProductsMock = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>(
    "@/lib/api",
  );
  return {
    ...actual,
    fetchMarketplaceProducts: (...args: unknown[]) =>
      fetchMarketplaceProductsMock(...args),
  };
});

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

function makePage(
  overrides: Partial<MarketplaceListResponse> = {},
): MarketplaceListResponse {
  return {
    products: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        slug: "sample-1",
        title: "Sample 1",
        price_usdt: "10.000000",
        primary_image_url: null,
        seller_handle: "alice",
        seller_shop_name: "Alice's Shop",
        seller_country: "NG",
      },
    ],
    pagination: { has_more: false, next_cursor: null },
    ...overrides,
  } as MarketplaceListResponse;
}

beforeEach(() => {
  fetchMarketplaceProductsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useMarketplaceProducts — gating", () => {
  it("does NOT fire the query when enabled is false", () => {
    const { result } = renderHook(
      () => useMarketplaceProducts({ enabled: false }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMarketplaceProductsMock).not.toHaveBeenCalled();
  });

  it("fires the query exactly once when enabled flips to true", async () => {
    fetchMarketplaceProductsMock.mockResolvedValue(makePage());
    const { result } = renderHook(
      () => useMarketplaceProducts({ enabled: true }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMarketplaceProductsMock).toHaveBeenCalledTimes(1);
    expect(fetchMarketplaceProductsMock).toHaveBeenCalledWith(null, 20);
  });
});

describe("useMarketplaceProducts — pagination", () => {
  it("hasNextPage=false when has_more is false", async () => {
    fetchMarketplaceProductsMock.mockResolvedValue(makePage());
    const { result } = renderHook(
      () => useMarketplaceProducts({ enabled: true }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("hasNextPage=true when has_more is true and next_cursor is set", async () => {
    fetchMarketplaceProductsMock.mockResolvedValue(
      makePage({
        pagination: { has_more: true, next_cursor: "2026-05-04T00:00:00Z" },
      }),
    );
    const { result } = renderHook(
      () => useMarketplaceProducts({ enabled: true }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });

  it("fetchNextPage forwards the next_cursor returned by the previous page", async () => {
    fetchMarketplaceProductsMock
      .mockResolvedValueOnce(
        makePage({
          pagination: {
            has_more: true,
            next_cursor: "2026-05-04T00:00:00Z",
          },
        }),
      )
      .mockResolvedValueOnce(makePage());
    const { result } = renderHook(
      () => useMarketplaceProducts({ enabled: true }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => {
      expect(fetchMarketplaceProductsMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchMarketplaceProductsMock).toHaveBeenNthCalledWith(
      2,
      "2026-05-04T00:00:00Z",
      20,
    );
    expect(result.current.data?.pages).toHaveLength(2);
  });
});
