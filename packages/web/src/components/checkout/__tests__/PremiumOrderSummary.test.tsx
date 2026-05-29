/**
 * Vitest specs for PremiumOrderSummary — checkout idle-phase recap.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PremiumOrderSummary } from "@/components/checkout/PremiumOrderSummary";
import type { ResolvedCart } from "@/lib/checkout";

const SAMPLE_CART: ResolvedCart = {
  groups: [
    {
      seller_handle: "atelier-mia",
      seller_shop_name: "Atelier Mia",
      seller_address: "0xseller1",
      items: [
        {
          product_id: "p1",
          product_slug: "tote-bag",
          title: "Tote bag",
          price_usdt: "12.00",
          qty: 1,
          image_url: null,
        },
      ],
      subtotal_usdt: "12.00",
      is_cross_border: false,
    },
    {
      seller_handle: "shopday",
      seller_shop_name: "Shopday",
      seller_address: "0xseller2",
      items: [
        {
          product_id: "p2",
          product_slug: "wrap",
          title: "Wrap dress",
          price_usdt: "6.50",
          qty: 2,
          image_url: null,
        },
      ],
      subtotal_usdt: "13.00",
      is_cross_border: false,
    },
  ],
  total_usdt: "25.00",
  issued_at: "2026-05-29T08:00:00Z",
  expires_at: "2026-05-29T09:00:00Z",
};

describe("PremiumOrderSummary", () => {
  it("renders one row per seller group with shop name + qty + subtotal", () => {
    render(<PremiumOrderSummary cart={SAMPLE_CART} buyerCountry={null} />);
    expect(screen.getByTestId("order-summary-row-atelier-mia")).toBeDefined();
    expect(screen.getByTestId("order-summary-row-shopday")).toBeDefined();
    expect(screen.getByText("Atelier Mia")).toBeDefined();
    expect(screen.getByText("Shopday")).toBeDefined();
    // Subtotal — qty=2 is shown as "2 items".
    const shopdayRow = screen.getByTestId("order-summary-row-shopday");
    expect(shopdayRow.textContent).toContain("2 items");
    expect(shopdayRow.textContent).toContain("13.00 USDT");
  });

  it("renders the grand total in USDT", () => {
    render(<PremiumOrderSummary cart={SAMPLE_CART} buyerCountry={null} />);
    expect(screen.getByTestId("order-summary-total-usdt").textContent).toBe(
      "25.00 USDT",
    );
  });

  it("renders the local-currency hint chips when buyerCountry is set", () => {
    render(<PremiumOrderSummary cart={SAMPLE_CART} buyerCountry="NGA" />);
    // 25.00 USDT * 1540 = 38 500 NGN
    expect(screen.getByTestId("order-summary-total-hint").textContent).toBe(
      "~₦38 500",
    );
    expect(
      screen.getByTestId("order-summary-hint-atelier-mia").textContent,
    ).toBe("~₦18 480");
  });

  it("hides the local-currency hint when buyerCountry is null", () => {
    render(<PremiumOrderSummary cart={SAMPLE_CART} buyerCountry={null} />);
    expect(screen.queryByTestId("order-summary-total-hint")).toBeNull();
    expect(screen.queryByTestId("order-summary-hint-atelier-mia")).toBeNull();
  });

  it("renders the escrow trust line on every render", () => {
    render(<PremiumOrderSummary cart={SAMPLE_CART} buyerCountry="NGA" />);
    expect(
      screen.getByText(/Funds held in escrow until you confirm delivery/),
    ).toBeDefined();
  });
});
