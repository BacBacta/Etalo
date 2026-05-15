/**
 * /orders/[id] page — J11.5 Block 4.F.
 *
 * State-machine coverage : not-connected → loading → 404 → error →
 * loaded. Hooks mocked at module boundary so vitest doesn't need
 * wagmi providers / QueryClient / Next.js router internals.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import OrderDetailPage from "@/app/(app)/orders/[id]/page";
import { BuyerOrderNotFoundError } from "@/lib/orders/api";
import type { OrderResponse } from "@/lib/orders/state";

const useParamsMock = vi.hoisted(() => vi.fn());
const useMinipayMock = vi.hoisted(() => vi.fn());
const useAccountMock = vi.hoisted(() => vi.fn());
const useBuyerOrderDetailMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: useParamsMock,
}));
vi.mock("@/hooks/useMinipay", () => ({
  useMinipay: useMinipayMock,
}));
vi.mock("wagmi", () => ({
  useAccount: useAccountMock,
}));
vi.mock("@/hooks/useBuyerOrderDetail", () => ({
  useBuyerOrderDetail: useBuyerOrderDetailMock,
}));
// Action button hooks pulled in by BuyerOrderActions — mock them so
// the loaded-state test doesn't need wagmi/QueryClient providers.
vi.mock("@/hooks/useConfirmDelivery", () => ({
  useConfirmDelivery: () => ({
    state: { phase: "idle" },
    run: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("@/hooks/useOpenDispute", () => ({
  useOpenDispute: () => ({
    state: { phase: "idle" },
    run: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("@/hooks/useClaimRefund", () => ({
  useClaimRefund: () => ({
    state: { phase: "idle" },
    run: vi.fn(),
    reset: vi.fn(),
  }),
}));

afterEach(() => {
  useParamsMock.mockReset();
  useMinipayMock.mockReset();
  useAccountMock.mockReset();
  useBuyerOrderDetailMock.mockReset();
});

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
    items: [
      {
        id: "i1",
        onchain_item_id: 1,
        item_index: 0,
        item_price_usdt: 70_000_000,
        item_commission_usdt: 1_260_000,
        status: "Pending",
        shipment_group_id: null,
        released_amount_usdt: 0,
        item_price_human: "70.0",
      },
    ],
    shipment_groups: [],
    total_amount_human: "70.0",
    total_commission_human: "1.26",
    ...overrides,
  };
}

describe("OrderDetailPage state machine", () => {
  it("not connected outside MiniPay : surfaces the open-from-MiniPay message", () => {
    useParamsMock.mockReturnValue({ id: "abc-123" });
    useMinipayMock.mockReturnValue({
      isInMinipay: false,
      isConnected: false,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({ address: undefined });
    useBuyerOrderDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    render(<OrderDetailPage />);
    expect(screen.getByTestId("order-detail-not-connected")).toBeInTheDocument();
  });

  it("loading : surfaces skeleton state", () => {
    useParamsMock.mockReturnValue({ id: "abc-123" });
    useMinipayMock.mockReturnValue({
      isInMinipay: true,
      isConnected: true,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({
      address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    });
    useBuyerOrderDetailMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<OrderDetailPage />);
    expect(screen.getByTestId("orders-loading-state")).toBeInTheDocument();
  });

  it("404 BuyerOrderNotFoundError : surfaces buyer-friendly not-found", () => {
    useParamsMock.mockReturnValue({ id: "abc-123" });
    useMinipayMock.mockReturnValue({
      isInMinipay: true,
      isConnected: true,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({
      address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    });
    useBuyerOrderDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BuyerOrderNotFoundError("abc-123"),
    });

    render(<OrderDetailPage />);
    expect(screen.getByTestId("order-detail-not-found")).toBeInTheDocument();
    // ADR-043 — copy must NOT discriminate "exists but not yours" vs
    // "doesn't exist" :
    expect(screen.getByText(/order not found or you don.t have permission/i)).toBeInTheDocument();
  });

  it("non-404 error : surfaces generic error", () => {
    useParamsMock.mockReturnValue({ id: "abc-123" });
    useMinipayMock.mockReturnValue({
      isInMinipay: true,
      isConnected: true,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({
      address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    });
    useBuyerOrderDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Backend down"),
    });

    render(<OrderDetailPage />);
    expect(screen.getByTestId("order-detail-error")).toBeInTheDocument();
    expect(screen.getByText(/backend down/i)).toBeInTheDocument();
  });

  it("loaded : renders header + items + actions", () => {
    useParamsMock.mockReturnValue({ id: "ffffffff-ffff-ffff-ffff-ffffffffffff" });
    useMinipayMock.mockReturnValue({
      isInMinipay: true,
      isConnected: true,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({
      address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    });
    useBuyerOrderDetailMock.mockReturnValue({
      data: makeOrder(),
      isLoading: false,
      isError: false,
    });

    render(<OrderDetailPage />);
    expect(screen.getByTestId("order-detail-loaded")).toBeInTheDocument();
    expect(screen.getByTestId("order-detail-header")).toBeInTheDocument();
    expect(screen.getByTestId("order-items-list")).toBeInTheDocument();
    expect(screen.getByTestId("buyer-order-actions")).toBeInTheDocument();
  });
});
