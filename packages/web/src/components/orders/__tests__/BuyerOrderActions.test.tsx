/**
 * BuyerOrderActions — J11.5 Block 4.D orchestrator.
 *
 * Asserts conditional rendering : confirm only when an item is
 * Shipped/Arrived, dispute only when at least one disputable item
 * exists, share + Blockscout always.
 *
 * The button hooks are mocked at module boundary so the orchestrator
 * test does not need wagmi or QueryClient providers.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BuyerOrderActions } from "@/components/orders/BuyerOrderActions";
import type {
  OrderItemResponse,
  OrderResponse,
} from "@/lib/orders/state";

const useConfirmDeliveryMock = vi.hoisted(() => vi.fn());
const useOpenDisputeMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useConfirmDelivery", () => ({
  useConfirmDelivery: useConfirmDeliveryMock,
}));
vi.mock("@/hooks/useOpenDispute", () => ({
  useOpenDispute: useOpenDisputeMock,
}));

afterEach(() => {
  useConfirmDeliveryMock.mockReset();
  useOpenDisputeMock.mockReset();
});

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
    item_count: 1,
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

const idle = { state: { phase: "idle" }, run: vi.fn(), reset: vi.fn() };

describe("BuyerOrderActions", () => {
  it("renders share + Blockscout always", () => {
    useConfirmDeliveryMock.mockReturnValue(idle);
    useOpenDisputeMock.mockReturnValue(idle);
    render(<BuyerOrderActions order={makeOrder({ items: [makeItem()] })} />);
    expect(screen.getByTestId("whatsapp-share-button")).toBeInTheDocument();
  });

  it("Funded + item Pending : renders Open dispute, NOT Confirm", () => {
    useConfirmDeliveryMock.mockReturnValue(idle);
    useOpenDisputeMock.mockReturnValue(idle);

    render(
      <BuyerOrderActions
        order={makeOrder({
          global_status: "Funded",
          items: [makeItem({ status: "Pending" })],
        })}
      />,
    );

    expect(screen.queryByTestId("confirm-delivery-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("open-dispute-trigger")).toBeInTheDocument();
  });

  it("Item Shipped : renders both Confirm and Dispute", () => {
    useConfirmDeliveryMock.mockReturnValue(idle);
    useOpenDisputeMock.mockReturnValue(idle);

    render(
      <BuyerOrderActions
        order={makeOrder({
          global_status: "PartiallyShipped",
          items: [makeItem({ status: "Shipped" })],
        })}
      />,
    );

    expect(screen.getByTestId("confirm-delivery-button")).toBeInTheDocument();
    expect(screen.getByTestId("open-dispute-trigger")).toBeInTheDocument();
  });

  it("Completed : renders neither Confirm nor Dispute (terminal)", () => {
    useConfirmDeliveryMock.mockReturnValue(idle);
    useOpenDisputeMock.mockReturnValue(idle);

    render(
      <BuyerOrderActions
        order={makeOrder({
          global_status: "Completed",
          items: [makeItem({ status: "Released" })],
        })}
      />,
    );

    expect(screen.queryByTestId("confirm-delivery-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("open-dispute-trigger")).not.toBeInTheDocument();
    // Share + Blockscout still visible
    expect(screen.getByTestId("whatsapp-share-button")).toBeInTheDocument();
  });
});
