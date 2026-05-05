/**
 * Vitest specs for ProductsTab — J10-V5 Phase 3 Block 5b smoke specs.
 *
 * Covers the empty-state EmptyStateV5 wiring (no-products illustration
 * + onClick-triggered ProductFormDialog open).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductsTab } from "@/components/seller/ProductsTab";

const fetchMyProductsMock = vi.fn();
vi.mock("@/lib/seller-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/seller-api")>(
      "@/lib/seller-api",
    );
  return {
    ...actual,
    fetchMyProducts: (...args: unknown[]) => fetchMyProductsMock(...args),
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
  fetchMyProductsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProductsTab — empty state (Block 5b)", () => {
  it("renders EmptyStateV5 no-products with CTA when product list is []", async () => {
    fetchMyProductsMock.mockResolvedValue({ products: [], total: 0 });
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
    fetchMyProductsMock.mockResolvedValue({ products: [], total: 0 });
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
