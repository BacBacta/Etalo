/**
 * OrderDetailHeader — J11.5 Block 4.C tests.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderDetailHeader } from "@/components/orders/OrderDetailHeader";
import type { OrderResponse } from "@/lib/orders/state";

function makeOrder(overrides: Partial<OrderResponse> = {}): OrderResponse {
  return {
    id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    onchain_order_id: 9001,
    buyer_address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    seller_address: "0xad7bbe9b75599d4703e3ca37350998f6c8d89596",
    seller_handle: "chioma",
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

describe("OrderDetailHeader", () => {
  it("renders the on-chain order id", () => {
    render(<OrderDetailHeader order={makeOrder({ onchain_order_id: 9001 })} />);
    expect(screen.getByText("Order #9001")).toBeInTheDocument();
  });

  it("renders the seller handle as a boutique link", () => {
    render(<OrderDetailHeader order={makeOrder({ seller_handle: "chioma" })} />);
    const link = screen.getByTestId("order-detail-seller-link");
    expect(link).toHaveAttribute("href", "/chioma");
    expect(link).toHaveTextContent("@chioma");
  });

  it("falls back to 'Unknown shop' when seller_handle is null", () => {
    render(<OrderDetailHeader order={makeOrder({ seller_handle: null })} />);
    expect(screen.getByText("Unknown shop")).toBeInTheDocument();
    expect(screen.queryByTestId("order-detail-seller-link")).not.toBeInTheDocument();
  });

  it("renders the order total in USDT", () => {
    render(<OrderDetailHeader order={makeOrder({ total_amount_usdt: 70_000_000 })} />);
    const total = screen.getByTestId("order-detail-total");
    expect(total).toHaveTextContent(/USDT/);
    expect(total).toHaveTextContent(/70/);
  });

  it("renders the status badge for the order's global_status", () => {
    render(<OrderDetailHeader order={makeOrder({ global_status: "Disputed" })} />);
    expect(screen.getByText("Dispute open")).toBeInTheDocument();
  });
});
