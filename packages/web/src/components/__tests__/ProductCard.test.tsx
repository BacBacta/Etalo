/**
 * Vitest specs for ProductCard + MarketplaceProductCard — J10-V5
 * Phase 4 Block 2 regression-guard.
 *
 * Asserts the CardV4 wrapper migration : flat `<div>` → `<CardV4
 * padding="none" interactive>` with the underlying product info still
 * accessible (heading, price, link target). Stubs next/image and
 * AddToCartIcon to keep the spec scoped.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketplaceProductCard } from "@/components/MarketplaceProductCard";
import { ProductCard } from "@/components/ProductCard";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />,
}));

vi.mock("@/components/AddToCartIcon", () => ({
  AddToCartIcon: () => <button type="button" data-testid="add-to-cart" />,
}));

describe("ProductCard (boutique) — CardV4 wrapper migration (P4 B2)", () => {
  const product = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Red Dress",
    slug: "red-dress",
    description: null,
    price_usdt: "30.00",
    stock: 5,
    primary_image_url: "https://gateway.pinata.cloud/ipfs/QmRed",
    image_ipfs_hashes: null,
    category: null,
    metadata_ipfs_hash: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  };

  it("renders product info inside a CardV4 wrapper (rounded-3xl shadow-celo-md)", () => {
    render(
      <ProductCard
        product={product}
        handle="chioma"
        sellerShopName="Chioma's Boutique"
      />,
    );
    const card = screen.getByTestId("product-card-wrapper");
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass("rounded-3xl");
    expect(card).toHaveClass("shadow-celo-md");
    // padding=none → no p-4 / p-6 on the wrapper
    expect(card.className).not.toMatch(/\bp-[46]\b/);
    expect(card).toHaveAttribute("data-interactive", "true");
    // overflow-hidden preserves the rounded corners around the image.
    expect(card).toHaveClass("overflow-hidden");
  });

  it("preserves the product title, price, and link target", () => {
    render(
      <ProductCard
        product={product}
        handle="chioma"
        sellerShopName="Chioma's Boutique"
      />,
    );
    expect(screen.getByText("Red Dress")).toBeInTheDocument();
    expect(screen.getByText("30.00 USDT")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/chioma/red-dress");
  });
});

describe("MarketplaceProductCard — CardV4 wrapper migration (P4 B2)", () => {
  const product = {
    id: "22222222-2222-2222-2222-222222222222",
    slug: "blue-shoes",
    title: "Blue Shoes",
    price_usdt: "55.00",
    primary_image_url: "https://gateway.pinata.cloud/ipfs/QmBlue",
    seller_handle: "ekene",
    seller_shop_name: "Ekene Shoes",
    seller_country: "NGA",
  };

  it("renders product info inside a CardV4 wrapper with seller line", () => {
    render(<MarketplaceProductCard product={product} />);
    const card = screen.getByTestId("marketplace-product-card-wrapper");
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass("rounded-3xl");
    expect(card).toHaveClass("shadow-celo-md");
    expect(card.className).not.toMatch(/\bp-[46]\b/);
    expect(card).toHaveAttribute("data-interactive", "true");

    expect(screen.getByText("Blue Shoes")).toBeInTheDocument();
    expect(screen.getByText("55.00 USDT")).toBeInTheDocument();
    // Seller line includes shop name + country (Nigeria).
    expect(screen.getByText(/Ekene Shoes/i)).toBeInTheDocument();
  });
});
