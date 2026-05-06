/**
 * OrderItemsList — J11.5 Block 4.C tests.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderItemsList } from "@/components/orders/OrderItemsList";
import type {
  OrderItemResponse,
  OrderResponse,
  ShipmentGroupResponse,
} from "@/lib/orders/state";

const GROUP_A = "11111111-1111-1111-1111-111111111111";

function makeItem(overrides: Partial<OrderItemResponse> = {}): OrderItemResponse {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    onchain_item_id: 1,
    item_index: 0,
    item_price_usdt: 35_000_000,
    item_commission_usdt: 630_000,
    status: "Pending",
    shipment_group_id: null,
    released_amount_usdt: 0,
    item_price_human: "35.0",
    ...overrides,
  };
}

function makeGroup(
  overrides: Partial<ShipmentGroupResponse> = {},
): ShipmentGroupResponse {
  return {
    id: GROUP_A,
    onchain_group_id: 1,
    status: "Pending",
    proof_hash: null,
    arrival_proof_hash: null,
    release_stage: 0,
    shipped_at: null,
    arrived_at: null,
    majority_release_at: null,
    final_release_after: null,
    ...overrides,
  };
}

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

describe("OrderItemsList", () => {
  it("renders nothing when items array is empty", () => {
    const { container } = render(<OrderItemsList order={makeOrder({ items: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one row per item with status badge", () => {
    const order = makeOrder({
      items: [
        makeItem({ id: "a", item_index: 0, status: "Shipped" }),
        makeItem({ id: "b", item_index: 1, status: "Disputed" }),
      ],
    });
    render(<OrderItemsList order={order} />);

    const rows = screen.getAllByTestId("order-item-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-item-status", "Shipped");
    expect(rows[1]).toHaveAttribute("data-item-status", "Disputed");
    expect(screen.getByText("Shipped")).toBeInTheDocument();
    expect(screen.getByText("Dispute open")).toBeInTheDocument();
  });

  it("displays human-readable item index (#1 not #0)", () => {
    render(
      <OrderItemsList
        order={makeOrder({
          items: [makeItem({ item_index: 0 })],
        })}
      />,
    );
    expect(screen.getByText("Item #1")).toBeInTheDocument();
  });

  it("shows shipped date when the item's group has shipped_at", () => {
    const order = makeOrder({
      items: [makeItem({ shipment_group_id: GROUP_A, status: "Shipped" })],
      shipment_groups: [
        makeGroup({ shipped_at: "2026-05-04T10:00:00Z", status: "Shipped" }),
      ],
    });
    render(<OrderItemsList order={order} />);
    expect(screen.getByText(/Shipped May 4/)).toBeInTheDocument();
  });

  it("renders item count in the section heading", () => {
    render(
      <OrderItemsList
        order={makeOrder({ items: [makeItem(), makeItem({ id: "b" })] })}
      />,
    );
    expect(screen.getByText("Items (2)")).toBeInTheDocument();
  });
});
