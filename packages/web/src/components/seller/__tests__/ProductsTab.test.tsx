/**
 * Vitest specs for ProductsTab — J10-V5 Phase 3 Block 5b smoke specs.
 *
 * Covers the empty-state EmptyStateV5 wiring (no-products illustration
 * + onClick-triggered ProductFormDialog open).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductsTab } from "@/components/seller/ProductsTab";

// Mock the TanStack Query hook directly so the test stays focused on
// presentation + interaction, no QueryClientProvider scaffolding
// required (matches the pattern used by OverviewTab + MarketingTab
// tests with useAnalyticsSummary / useCreditsBalance).
const useMyProductsMock = vi.fn();
vi.mock("@/hooks/useMyProducts", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMyProducts")>(
    "@/hooks/useMyProducts",
  );
  return {
    ...actual,
    useMyProducts: (...args: unknown[]) => useMyProductsMock(...args),
  };
});

// `useQueryClient` is invoked inside ProductsTab for the cache-invalidate
// path post-mutation. Stub it so we don't need a QueryClientProvider
// wrapper just to render the tab.
const invalidateQueriesMock = vi.fn();
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: invalidateQueriesMock,
    }),
  };
});

// ProductFormDialog mounts a Radix Dialog; render-stub keeps the test
// focused on the empty-state CTA wiring rather than the dialog tree.
vi.mock("@/components/seller/ProductFormDialog", () => ({
  ProductFormDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="product-form-open" /> : null,
}));
vi.mock("@/components/seller/DeleteProductDialog", () => ({
  DeleteProductDialog: () => null,
}));

// Helper : build the shape the hook would return on a happy-path
// resolved fetch. `data` is what useQuery returns when not pending +
// not erroring.
function happyPath<T>(data: T) {
  return {
    data,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  };
}

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

const WALLET = "0xabc0000000000000000000000000000000000001";

beforeEach(() => {
  useMyProductsMock.mockReset();
  invalidateQueriesMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProductsTab — empty state (Block 5b)", () => {
  it("renders EmptyStateV5 no-products with CTA when product list is []", async () => {
    useMyProductsMock.mockReturnValue(happyPath({ products: [], total: 0 }));
    render(
      // @ts-expect-error — minimal stub for unused profile fields
      <ProductsTab profile={PROFILE} walletAddress={WALLET} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("empty-illustration")).toHaveAttribute(
        "data-asset",
        "no-products",
      );
    });
    const cta = screen.getByTestId("empty-state-action");
    expect(cta).toHaveTextContent(/Add your first product/i);
  });

  it("CTA opens the ProductFormDialog (create mode)", async () => {
    useMyProductsMock.mockReturnValue(happyPath({ products: [], total: 0 }));
    render(
      // @ts-expect-error — minimal stub
      <ProductsTab profile={PROFILE} walletAddress={WALLET} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("empty-state-action")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("empty-state-action"));
    expect(screen.getByTestId("product-form-open")).toBeInTheDocument();
  });
});
