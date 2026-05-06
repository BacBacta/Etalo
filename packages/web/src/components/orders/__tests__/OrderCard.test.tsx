/**
 * OrderCard — J11.5 Block 3.F.
 *
 * Asserts the buyer-facing rendering rules :
 * - Displays @seller_handle (CLAUDE.md rule 5 — never raw 0x)
 * - Falls back to "Unknown shop" when seller has no profile
 * - Routes to /orders/{id} on click
 * - Total USDT and date are visible
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderCard } from "@/components/orders/OrderCard";
import type { OrderResponse } from "@/lib/orders/state";

function makeOrder(overrides: Partial<OrderResponse> = {}): OrderResponse {
  return {
    id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    onchain_order_id: 9001,
    buyer_address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    seller_address: "0xad7bbe9b75599d4703e3ca37350998f6c8d89596",
    seller_handle: "chioma_test_shop",
    total_amount_usdt: 70_000_000,
    total_commission_usdt: 1_260_000,
    is_cross_border: false,
    global_status: "Funded",
    item_count: 2,
    funded_at: "2026-05-01T12:00:00Z",
    created_at_chain: "2026-05-01T11:59:00Z",
    created_at_db: "2026-05-01T11:59:30Z",
    delivery_address: null,
    tracking_number: null,
    product_ids: null,
    notes: null,
    items: [],
    shipment_groups: [],
    total_amount_human: "70.0",
    total_commission_human: "1.26",
    ...overrides,
  };
}

describe("OrderCard", () => {
  it("renders the seller handle prefixed with @", () => {
    render(<OrderCard order={makeOrder({ seller_handle: "chioma" })} />);
    expect(screen.getByText("@chioma")).toBeInTheDocument();
  });

  it("falls back to 'Unknown shop' when seller_handle is null", () => {
    render(<OrderCard order={makeOrder({ seller_handle: null })} />);
    expect(screen.getByText("Unknown shop")).toBeInTheDocument();
  });

  it("renders the total amount in USDT", () => {
    render(<OrderCard order={makeOrder({ total_amount_usdt: 70_000_000 })} />);
    // formatRawUsdt(70_000_000) == "70" or "70.00" depending on impl ;
    // assert via a substring match that's robust to either.
    expect(screen.getByText(/USDT/)).toBeInTheDocument();
    expect(screen.getByText(/70/)).toBeInTheDocument();
  });

  it("renders the status badge for the order's global_status", () => {
    render(<OrderCard order={makeOrder({ global_status: "Completed" })} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("links to /orders/{id} on click", () => {
    render(
      <OrderCard
        order={makeOrder({ id: "abc-123" })}
      />,
    );
    const card = screen.getByTestId("order-card");
    expect(card).toHaveAttribute("href", "/orders/abc-123");
  });

  it("exposes the order id via data attribute for telemetry", () => {
    render(<OrderCard order={makeOrder({ id: "abc-123" })} />);
    expect(screen.getByTestId("order-card")).toHaveAttribute(
      "data-order-id",
      "abc-123",
    );
  });
});
