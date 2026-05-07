/**
 * Vitest specs for MarketplacePage post sub-block 2.3a refactor.
 *
 * Covers the consumer contract on the new useMarketplaceProducts hook —
 * pending → grid → Refresh button + Load more pagination + error retry.
 * useMarketplaceProducts is mocked at the module boundary so each spec
 * can drive a specific UseInfiniteQueryResult shape without spinning up
 * a real QueryClient or stubbing fetchMarketplaceProducts (those paths
 * are exercised in useMarketplaceProducts.test.tsx).
 *
 * detectMiniPay is mocked to true so the redirect branch never fires
 * and the test always lands on the rendered surface.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MarketplacePage from "@/app/marketplace/page";
import {
  PULL_TO_REFRESH_THRESHOLD_PX,
  shouldTriggerRefreshOnRelease,
} from "@/app/marketplace/pull-to-refresh";
import type { MarketplaceListResponse } from "@/lib/api";

const useMarketplaceProductsMock = vi.fn();

vi.mock("@/hooks/useMarketplaceProducts", () => ({
  useMarketplaceProducts: (opts: unknown) => useMarketplaceProductsMock(opts),
  MARKETPLACE_PRODUCTS_QUERY_KEY: ["marketplace-products"] as const,
}));

vi.mock("@/lib/minipay-detect", () => ({
  detectMiniPay: () => true,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/marketplace",
}));

// J11.7 Block 9 — MarketplacePage now reads buyer country + connection
// state to gate the prompt banner + drive the default filter. Mock
// both at the module boundary so existing pre-Block-9 specs don't have
// to know about the new data path.
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
}));

vi.mock("@/hooks/useBuyerCountry", () => ({
  useBuyerCountry: () => ({
    data: null,
    isSuccess: false,
    isLoading: false,
    isError: false,
  }),
  useSetMyCountry: () => ({ mutate: vi.fn(), isPending: false }),
}));

// MarketplaceGrid renders next/image which doesn't run cleanly in jsdom;
// stub it out so specs stay focused on page-level wiring.
vi.mock("@/components/MarketplaceGrid", () => ({
  MarketplaceGrid: ({
    products,
  }: {
    products: { id: string; title: string }[];
  }) => (
    <div data-testid="marketplace-grid">
      {products.map((p) => (
        <span key={p.id}>{p.title}</span>
      ))}
    </div>
  ),
}));

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

interface QueryShape {
  data?: { pages: MarketplaceListResponse[] };
  isPending?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  refetch?: ReturnType<typeof vi.fn>;
  fetchNextPage?: ReturnType<typeof vi.fn>;
}

function setQuery(shape: QueryShape) {
  useMarketplaceProductsMock.mockReturnValue({
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    ...shape,
  });
}

describe("MarketplacePage — sub-block 2.3a", () => {
  it("renders the SkeletonV5 grid while the query is pending", () => {
    setQuery({ isPending: true });
    render(<MarketplacePage />);
    expect(screen.getByTestId("marketplace-loading")).toBeInTheDocument();
  });

  it("renders the products grid + visible Refresh button when data lands", () => {
    setQuery({ data: { pages: [makePage()] } });
    render(<MarketplacePage />);
    expect(screen.getByTestId("marketplace-grid")).toBeInTheDocument();
    expect(screen.getByText("Sample 1")).toBeInTheDocument();
    const refresh = screen.getByTestId("marketplace-refresh");
    expect(refresh).toHaveAttribute(
      "aria-label",
      "Refresh marketplace products",
    );
    expect(refresh).not.toBeDisabled();
  });

  it("Refresh button click calls refetch", () => {
    const refetch = vi.fn();
    setQuery({ data: { pages: [makePage()] }, refetch });
    render(<MarketplacePage />);
    fireEvent.click(screen.getByTestId("marketplace-refresh"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("Refresh button is disabled while a refetch is in flight", () => {
    setQuery({
      data: { pages: [makePage()] },
      isFetching: true,
      isFetchingNextPage: false,
    });
    render(<MarketplacePage />);
    expect(screen.getByTestId("marketplace-refresh")).toBeDisabled();
  });

  it("Refresh button stays enabled when only the Load more pagination is fetching", () => {
    setQuery({
      data: { pages: [makePage()] },
      isFetching: true,
      isFetchingNextPage: true,
    });
    render(<MarketplacePage />);
    expect(screen.getByTestId("marketplace-refresh")).not.toBeDisabled();
  });

  it("renders Load more button + calls fetchNextPage when hasNextPage", () => {
    const fetchNextPage = vi.fn();
    setQuery({
      data: { pages: [makePage()] },
      hasNextPage: true,
      fetchNextPage,
    });
    render(<MarketplacePage />);
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("error state Retry button calls refetch (no full page reload)", () => {
    const refetch = vi.fn();
    setQuery({ isError: true, refetch });
    render(<MarketplacePage />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("shouldTriggerRefreshOnRelease — pull-to-refresh threshold helper", () => {
  it("returns true when pull distance reaches the threshold", () => {
    expect(
      shouldTriggerRefreshOnRelease(PULL_TO_REFRESH_THRESHOLD_PX),
    ).toBe(true);
  });

  it("returns false when pull distance is below the threshold", () => {
    expect(
      shouldTriggerRefreshOnRelease(PULL_TO_REFRESH_THRESHOLD_PX - 1),
    ).toBe(false);
  });

  it("returns false at zero distance (no pull at all)", () => {
    expect(shouldTriggerRefreshOnRelease(0)).toBe(false);
  });
});

describe("MarketplacePage — sub-block 2.3b pull-to-refresh", () => {
  // jsdom defaults window.scrollY to 0. The "scrolled past top" spec
  // overrides it and restores after.
  afterEach(() => {
    Object.defineProperty(window, "scrollY", {
      value: 0,
      writable: true,
      configurable: true,
    });
  });

  it("fires refetch when the user pulls past the threshold from the top", () => {
    const refetch = vi.fn();
    setQuery({ data: { pages: [makePage()] }, refetch });
    render(<MarketplacePage />);
    const pullArea = screen.getByTestId("marketplace-pull-area");

    // 200 px raw delta * 0.5 resistance = 100 px visual pull > 80 threshold.
    fireEvent.pointerDown(pullArea, { clientY: 0 });
    fireEvent.pointerMove(pullArea, { clientY: 200 });
    fireEvent.pointerUp(pullArea, { clientY: 200 });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("snaps back without refetch when the pull stays below the threshold", () => {
    const refetch = vi.fn();
    setQuery({ data: { pages: [makePage()] }, refetch });
    render(<MarketplacePage />);
    const pullArea = screen.getByTestId("marketplace-pull-area");

    // 100 px raw delta * 0.5 resistance = 50 px visual pull < 80 threshold.
    fireEvent.pointerDown(pullArea, { clientY: 0 });
    fireEvent.pointerMove(pullArea, { clientY: 100 });
    fireEvent.pointerUp(pullArea, { clientY: 100 });

    expect(refetch).not.toHaveBeenCalled();
  });

  it("does NOT initiate a pull when the page is scrolled past the top", () => {
    Object.defineProperty(window, "scrollY", {
      value: 200,
      writable: true,
      configurable: true,
    });
    const refetch = vi.fn();
    setQuery({ data: { pages: [makePage()] }, refetch });
    render(<MarketplacePage />);
    const pullArea = screen.getByTestId("marketplace-pull-area");

    fireEvent.pointerDown(pullArea, { clientY: 0 });
    fireEvent.pointerMove(pullArea, { clientY: 300 });
    fireEvent.pointerUp(pullArea, { clientY: 300 });

    expect(refetch).not.toHaveBeenCalled();
  });

  it("renders the pull-to-refresh indicator with aria-hidden so screen readers ignore it", () => {
    setQuery({ data: { pages: [makePage()] } });
    render(<MarketplacePage />);
    const indicator = screen.getByTestId("marketplace-pull-indicator");
    expect(indicator).toHaveAttribute("aria-hidden", "true");
  });
});
