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
// Mocks — analytics hook (5.3) + recent-orders fetch (Block 3b) +
// ChartLineV5 (5.5 ; the real component is dynamic ssr:false +
// recharts which crashes in jsdom without a ResizeObserver stub —
// stubbing the wrapper at the module boundary is simpler and lets
// the test assert on the data the component would receive).
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

vi.mock("@/components/ui/v5/ChartLineV5", () => ({
  ChartLineV5: ({
    data,
    height,
  }: {
    data: { label: string; value: number }[];
    height?: number;
  }) => (
    <div
      data-testid="chart-line-mock"
      data-height={height}
      data-point-count={data.length}
    >
      {data.map((p, i) => (
        <span key={i} data-testid={`chart-line-mock-point-${i}`}>
          {p.label}:{p.value}
        </span>
      ))}
    </div>
  ),
}));

// Block 5 sub-block 5.6 — next/image stub. The real component pulls
// in the Next.js image-loader runtime which doesn't run cleanly under
// jsdom. Same per-file mock pattern used by ProductCard.test.tsx,
// HomeRouter.test.tsx, MarketingTab.test.tsx — there's no shared
// global stub in src/test/setup.ts.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    width,
    height,
  }: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} />
  ),
}));

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

// Backend zero-fills timeline_7d to exactly 7 entries — fixtures
// mirror that. Dates chosen UTC so the locale-pinned formatter
// produces deterministic "Apr 25" through "May 1" labels.
const POPULATED_TIMELINE: AnalyticsSummaryParsed["revenue"]["timeline_7d"] = [
  { date: "2026-04-25", revenue_usdt: 0 },
  { date: "2026-04-26", revenue_usdt: 12.5 },
  { date: "2026-04-27", revenue_usdt: 0 },
  { date: "2026-04-28", revenue_usdt: 25.5 },
  { date: "2026-04-29", revenue_usdt: 0 },
  { date: "2026-04-30", revenue_usdt: 100 },
  { date: "2026-05-01", revenue_usdt: 70.5 },
];

const POPULATED: AnalyticsSummaryParsed = {
  revenue: {
    h24: 70.5,
    d7: 245,
    d30: 980,
    timeline_7d: POPULATED_TIMELINE,
  },
  active_orders: 3,
  escrow: { in_escrow: 100, released: 50 },
  reputation: { score: 0, badge: "active", auto_release_days: 3 },
  top_products: [],
};

const ZEROED: AnalyticsSummaryParsed = {
  revenue: {
    h24: 0,
    d7: 0,
    d30: 0,
    timeline_7d: POPULATED_TIMELINE.map((p) => ({
      date: p.date,
      revenue_usdt: 0,
    })),
  },
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
      // Reorder hotfix : actionable info first (In escrow → Active
      // orders → Revenue 24h → Revenue 7d). The old order had the
      // most-actionable number ("In escrow") in the 4th and smallest
      // tile slot.
      "In escrow",
      "Active orders",
      "Revenue 24h",
      "Revenue 7d",
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
    expect(screen.getByText(/Released to wallet:\s*50\.00 USDT/)).toBeInTheDocument();
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
    expect(screen.getByText(/Released to wallet:\s*0\.00 USDT/)).toBeInTheDocument();
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

// ============================================================
// Block 5 sub-block 5.5 — Revenue trend chart
// ============================================================
describe("OverviewTab — revenue trend ChartLineV5 (Block 5 sub-block 5.5)", () => {
  it("renders the chart card heading and a skeleton placeholder while pending", () => {
    useAnalyticsSummaryMock.mockReturnValue(loadingState());
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    expect(
      screen.getByText(/Revenue trend \(last 7 days\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("overview-revenue-chart-skeleton"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("chart-line-mock")).not.toBeInTheDocument();
  });

  it("renders an 'Unable to load chart' fallback when the hook errors", () => {
    useAnalyticsSummaryMock.mockReturnValue(errorState());
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    expect(
      screen.getByTestId("overview-revenue-chart-error"),
    ).toHaveTextContent(/Unable to load chart/i);
    expect(screen.queryByTestId("chart-line-mock")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("overview-revenue-chart-skeleton"),
    ).not.toBeInTheDocument();
  });

  it("forwards 7 mapped data points to ChartLineV5 with formatted date labels + numeric values", () => {
    useAnalyticsSummaryMock.mockReturnValue(dataState(POPULATED));
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    const chart = screen.getByTestId("chart-line-mock");
    expect(chart).toHaveAttribute("data-point-count", "7");
    expect(chart).toHaveAttribute("data-height", "200");
    // Each point's label must come from the en-US UTC formatter, not
    // the system locale (sub-block 5.4 lesson : Mike's box is fr_FR
    // which would otherwise emit "26 avr." instead of "Apr 26").
    expect(
      screen.getByTestId("chart-line-mock-point-1"),
    ).toHaveTextContent("Apr 26:12.5");
    expect(
      screen.getByTestId("chart-line-mock-point-3"),
    ).toHaveTextContent("Apr 28:25.5");
    expect(
      screen.getByTestId("chart-line-mock-point-6"),
    ).toHaveTextContent("May 1:70.5");
  });

  it("renders the 'Waiting for first sale' empty-state guidance when the 7d timeline is all zeros", () => {
    // OverviewTab now intercepts the all-zero case before falling into
    // ChartLineV5 — a flat-zero baseline reads as broken on the seller
    // dashboard (screenshot critique). The empty branch nudges the
    // seller toward sharing their boutique link instead of showing a
    // chart with nothing to convey.
    useAnalyticsSummaryMock.mockReturnValue(dataState(ZEROED));
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    const empty = screen.getByTestId("overview-revenue-chart-empty");
    expect(empty).toHaveTextContent(/Waiting for your first sale/i);
    expect(empty).toHaveTextContent(
      /Share your boutique link to start receiving orders/i,
    );
    // The chart itself must not render under this branch.
    expect(screen.queryByTestId("chart-line-mock")).not.toBeInTheDocument();
  });

  it("date labels are timezone-stable (UTC) and locale-stable (en-US)", () => {
    useAnalyticsSummaryMock.mockReturnValue(dataState(POPULATED));
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    // The 7 fixture dates are 2026-04-25 ... 2026-05-01 inclusive.
    // En-US UTC formatting yields "Apr 25" .. "May 1". A non-UTC
    // formatter on a UTC- offset machine would shift one or more
    // dates back by a day; this assertion catches that regression.
    const expectedLabels = [
      "Apr 25",
      "Apr 26",
      "Apr 27",
      "Apr 28",
      "Apr 29",
      "Apr 30",
      "May 1",
    ];
    for (let i = 0; i < expectedLabels.length; i++) {
      expect(
        screen.getByTestId(`chart-line-mock-point-${i}`).textContent,
      ).toMatch(new RegExp(`^${expectedLabels[i]}:`));
    }
  });
});

// ============================================================
// Block 5 sub-block 5.6 — Top products section
// ============================================================
const TOP_PRODUCTS_FIXTURE: AnalyticsSummaryParsed["top_products"] = [
  {
    product_id: "p1",
    title: "Red Ankara Dress",
    revenue_usdt: 150,
    image_ipfs_hash: "QmHash1",
  },
  {
    product_id: "p2",
    title: "Hand-Beaded Bracelet",
    revenue_usdt: 75.5,
    image_ipfs_hash: "QmHash2",
  },
  {
    product_id: "p3",
    title: "Test Product (no image)",
    revenue_usdt: 30.25,
    image_ipfs_hash: null,
  },
];

function withTopProducts(
  products: AnalyticsSummaryParsed["top_products"],
): AnalyticsSummaryParsed {
  return { ...POPULATED, top_products: products };
}

describe("OverviewTab — top products (Block 5 sub-block 5.6)", () => {
  it("renders 3 skeleton rows while the analytics hook is pending", () => {
    useAnalyticsSummaryMock.mockReturnValue(loadingState());
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    expect(screen.getByText(/^Top products$/)).toBeInTheDocument();
    const skeletonGroup = screen.getByTestId(
      "overview-top-products-skeleton",
    );
    expect(skeletonGroup).toBeInTheDocument();
    expect(skeletonGroup.children).toHaveLength(3);
    expect(
      screen.queryByTestId("overview-top-products-list"),
    ).not.toBeInTheDocument();
  });

  it("renders an 'Unable to load top products' fallback when the hook errors", () => {
    useAnalyticsSummaryMock.mockReturnValue(errorState());
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    expect(
      screen.getByTestId("overview-top-products-error"),
    ).toHaveTextContent(/Unable to load top products/i);
    expect(
      screen.queryByTestId("overview-top-products-list"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("overview-top-products-empty"),
    ).not.toBeInTheDocument();
  });

  it("renders the empty-state copy when top_products is []", () => {
    useAnalyticsSummaryMock.mockReturnValue(dataState(withTopProducts([])));
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    const empty = screen.getByTestId("overview-top-products-empty");
    expect(empty).toHaveTextContent(/No top products yet/i);
    expect(empty).toHaveTextContent(/once orders complete/i);
    expect(
      screen.queryByTestId("overview-top-products-list"),
    ).not.toBeInTheDocument();
  });

  it("renders 3 rows with title + USDT-formatted revenue + IPFS image when populated", () => {
    useAnalyticsSummaryMock.mockReturnValue(
      dataState(withTopProducts(TOP_PRODUCTS_FIXTURE)),
    );
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    const rows = screen.getAllByTestId("overview-top-product-row");
    expect(rows).toHaveLength(3);

    // Row 0 — full data path : title + image (Pinata gateway URL) +
    // 2-decimal USDT.
    expect(rows[0]).toHaveAttribute("data-product-id", "p1");
    expect(rows[0]).toHaveTextContent("Red Ankara Dress");
    expect(rows[0]).toHaveTextContent("150.00 USDT");
    const img0 = rows[0].querySelector("img");
    expect(img0).not.toBeNull();
    expect(img0!.getAttribute("src")).toBe(
      "https://gateway.pinata.cloud/ipfs/QmHash1",
    );
    expect(img0!.getAttribute("alt")).toBe("Red Ankara Dress");

    // Row 1 — confirms decimal precision (75.5 -> "75.50 USDT").
    expect(rows[1]).toHaveTextContent("Hand-Beaded Bracelet");
    expect(rows[1]).toHaveTextContent("75.50 USDT");

    // Row 2 — null image_ipfs_hash falls back to the "No image"
    // placeholder, NOT a broken <img> tag.
    expect(rows[2]).toHaveTextContent("Test Product (no image)");
    expect(rows[2]).toHaveTextContent("30.25 USDT");
    expect(rows[2].querySelector("img")).toBeNull();
    expect(
      rows[2].querySelector(
        '[data-testid="overview-top-product-no-image"]',
      ),
    ).not.toBeNull();
  });

  it("renders only one row + the no-image fallback when the single top product has null image_ipfs_hash", () => {
    useAnalyticsSummaryMock.mockReturnValue(
      dataState(
        withTopProducts([
          {
            product_id: "solo",
            title: "Lone Product",
            revenue_usdt: 12,
            image_ipfs_hash: null,
          },
        ]),
      ),
    );
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    const rows = screen.getAllByTestId("overview-top-product-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Lone Product");
    expect(rows[0]).toHaveTextContent("12.00 USDT");
    expect(rows[0].querySelector("img")).toBeNull();
    expect(
      screen.getByTestId("overview-top-product-no-image"),
    ).toBeInTheDocument();
  });

  it("constructs the IPFS image src via the canonical Pinata gateway", () => {
    useAnalyticsSummaryMock.mockReturnValue(
      dataState(
        withTopProducts([
          {
            product_id: "p1",
            title: "Test",
            revenue_usdt: 1,
            image_ipfs_hash: "QmTestHash",
          },
        ]),
      ),
    );
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        address={ADDRESS}
      />,
    );
    const img = screen
      .getByTestId("overview-top-product-row")
      .querySelector("img");
    expect(img).not.toBeNull();
    // The exact URL format must match what next.config.mjs's
    // remotePatterns whitelists ; if someone swaps the gateway host
    // here without updating the config, next/image will reject the
    // src in production. Pin the contract.
    expect(img!.getAttribute("src")).toBe(
      "https://gateway.pinata.cloud/ipfs/QmTestHash",
    );
  });
});
