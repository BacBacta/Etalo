/**
 * Vitest specs for OverviewTab — Phase 3 Block 3b regression-guard
 * (Recent orders skeleton-vs-empty distinction) + J10-V5 Phase 4
 * Block 5 sub-block 5.4 (4 KPI tiles wired to useAnalyticsSummary).
 *
 * The hook itself is independently tested in
 * hooks/__tests__/useAnalyticsSummary.test.tsx (12 specs covering the
 * Decimal selector + ADR-041 badge filter + gating + error
 * propagation). This file mocks the hook directly rather than
 * standing up a QueryClientProvider — the OverviewTab assertions are
 * about presentation, not the data flow.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OverviewTab } from "@/components/seller/OverviewTab";
import type { AnalyticsSummaryParsed } from "@/hooks/useAnalyticsSummary";

// ============================================================
// Mocks — analytics hook (5.3) + recent-orders fetch (Block 3b)
// ============================================================
const useAnalyticsSummaryMock = vi.fn();
vi.mock("@/hooks/useAnalyticsSummary", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/useAnalyticsSummary")
  >("@/hooks/useAnalyticsSummary");
  return {
    ...actual,
    useAnalyticsSummary: (...args: unknown[]) =>
      useAnalyticsSummaryMock(...args),
  };
});

const fetchSellerOrdersMock = vi.fn();
vi.mock("@/lib/seller-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/seller-api")>(
      "@/lib/seller-api",
    );
  return {
    ...actual,
    fetchSellerOrders: (...args: unknown[]) =>
      fetchSellerOrdersMock(...args),
  };
});

const ADDRESS = "0xabc0000000000000000000000000000000000001";

const PROFILE = {
  shop_handle: "test-shop",
  display_name: "Test Shop",
  bio: null,
  avatar_url: null,
  region_country: "NG",
  whatsapp_number: null,
  instagram_handle: null,
  tiktok_handle: null,
  created_at: "2026-04-01T00:00:00Z",
};

// Helpers — shape minimum useQuery-like return values the component
// reads. The full UseQueryResult interface is large but the component
// only consumes data / isPending / isError, so the stubs stay narrow.
function loadingState() {
  return { data: undefined, isPending: true, isError: false };
}
function errorState() {
  return { data: undefined, isPending: false, isError: true };
}
function dataState(parsed: AnalyticsSummaryParsed) {
  return { data: parsed, isPending: false, isError: false };
}

const POPULATED: AnalyticsSummaryParsed = {
  revenue: {
    h24: 70.5,
    d7: 245,
    d30: 980,
    timeline_7d: [],
  },
  active_orders: 3,
  escrow: { in_escrow: 100, released: 50 },
  reputation: { score: 0, badge: "active", auto_release_days: 3 },
  top_products: [],
};

const ZEROED: AnalyticsSummaryParsed = {
  revenue: { h24: 0, d7: 0, d30: 0, timeline_7d: [] },
  active_orders: 0,
  escrow: { in_escrow: 0, released: 0 },
  reputation: { score: 0, badge: "new_seller", auto_release_days: 3 },
  top_products: [],
};

beforeEach(() => {
  fetchSellerOrdersMock.mockReset();
  useAnalyticsSummaryMock.mockReset();
  // Default the analytics hook to loading state so individual specs
  // only override what they care about.
  useAnalyticsSummaryMock.mockReturnValue(loadingState());
  // Default the recent-orders fetch to never-resolves so the recent
  // section sits in skeleton state and doesn't pollute KPI assertions.
  fetchSellerOrdersMock.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Block 3b regression-guard — preserved unchanged in 5.4
// ============================================================
describe("OverviewTab — Recent orders false-empty regression-guard (Block 3b)", () => {
  it("shows skeleton stack while recent === null (fetch in flight), NOT empty state", () => {
    fetchSellerOrdersMock.mockReturnValue(new Promise(() => {}));
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub for unused profile prop
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    expect(screen.getByTestId("overview-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/No orders yet/i)).not.toBeInTheDocument();
  });

  it("shows 'No orders yet' once recent resolves with []", async () => {
    fetchSellerOrdersMock.mockResolvedValue({
      orders: [],
      pagination: { total: 0, has_more: false, next_cursor: null },
    });
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    expect(screen.getByTestId("overview-skeleton")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId("overview-skeleton"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/No orders yet/i)).toBeInTheDocument();
  });
});

// ============================================================
// Block 5 sub-block 5.4 — KPI tiles wire-up
// ============================================================
describe("OverviewTab — 4 KPI tiles (Block 5 sub-block 5.4)", () => {
  it("renders the 4 expected tile labels", () => {
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    const tiles = screen.getAllByTestId("overview-kpi-tile");
    expect(tiles).toHaveLength(4);
    const labels = tiles.map((t) => t.getAttribute("data-label"));
    expect(labels).toEqual([
      "Revenue 24h",
      "Revenue 7d",
      "Active orders",
      "In escrow",
    ]);
  });

  it("renders 4 skeleton placeholders while the analytics hook is pending", () => {
    useAnalyticsSummaryMock.mockReturnValue(loadingState());
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    expect(
      screen.getByTestId("overview-kpi-skeleton-revenue-24h"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("overview-kpi-skeleton-revenue-7d"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("overview-kpi-skeleton-active-orders"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("overview-kpi-skeleton-in-escrow"),
    ).toBeInTheDocument();
    // No formatted values painted while pending.
    expect(screen.queryByText(/USDT/)).not.toBeInTheDocument();
  });

  it("renders an em-dash fallback per tile when the hook errors", () => {
    useAnalyticsSummaryMock.mockReturnValue(errorState());
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    const fallbacks = screen
      .getAllByText("—")
      .filter((el) => el.dataset.testid?.startsWith("overview-kpi-fallback-"));
    expect(fallbacks).toHaveLength(4);
    // No numeric values painted on error.
    expect(screen.queryByText(/USDT/)).not.toBeInTheDocument();
  });

  it("formats populated values with USDT suffix + 2-decimal precision + tabular nums", () => {
    useAnalyticsSummaryMock.mockReturnValue(dataState(POPULATED));
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    expect(
      screen.getByTestId("overview-kpi-value-revenue-24h"),
    ).toHaveTextContent("70.50 USDT");
    expect(
      screen.getByTestId("overview-kpi-value-revenue-7d"),
    ).toHaveTextContent("245.00 USDT");
    expect(
      screen.getByTestId("overview-kpi-value-active-orders"),
    ).toHaveTextContent("3");
    expect(
      screen.getByTestId("overview-kpi-value-in-escrow"),
    ).toHaveTextContent("100.00 USDT");
    // In-escrow tile carries a sub-text with the released amount.
    expect(screen.getByText(/Released:\s*50\.00 USDT/)).toBeInTheDocument();
  });

  it("renders zeroed values as '0.00 USDT' / '0' (never NaN, never empty)", () => {
    useAnalyticsSummaryMock.mockReturnValue(dataState(ZEROED));
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    expect(
      screen.getByTestId("overview-kpi-value-revenue-24h"),
    ).toHaveTextContent("0.00 USDT");
    expect(
      screen.getByTestId("overview-kpi-value-revenue-7d"),
    ).toHaveTextContent("0.00 USDT");
    expect(
      screen.getByTestId("overview-kpi-value-active-orders"),
    ).toHaveTextContent("0");
    expect(
      screen.getByTestId("overview-kpi-value-in-escrow"),
    ).toHaveTextContent("0.00 USDT");
    expect(screen.getByText(/Released:\s*0\.00 USDT/)).toBeInTheDocument();
    // Sanity : "NaN" must never reach the DOM.
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("passes the address through to useAnalyticsSummary so the query key is wallet-scoped", () => {
    useAnalyticsSummaryMock.mockReturnValue(loadingState());
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    expect(useAnalyticsSummaryMock).toHaveBeenCalledWith(ADDRESS);
  });
});
