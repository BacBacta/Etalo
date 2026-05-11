/**
 * /orders page — J11.5 Block 3.F.
 *
 * State-machine integration test : asserts the right surface renders
 * for each {connection × query} combination. Hooks are mocked at the
 * module boundary so we don't need a real QueryClient or wagmi
 * provider.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import OrdersPage from "@/app/(app)/orders/page";
import type { OrderResponse } from "@/lib/orders/state";

const useMinipayMock = vi.hoisted(() => vi.fn());
const useAccountMock = vi.hoisted(() => vi.fn());
const useBuyerOrdersMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useMinipay", () => ({
  useMinipay: useMinipayMock,
}));

vi.mock("wagmi", () => ({
  useAccount: useAccountMock,
}));

vi.mock("@/hooks/useBuyerOrders", () => ({
  useBuyerOrders: useBuyerOrdersMock,
}));

afterEach(() => {
  useMinipayMock.mockReset();
  useAccountMock.mockReset();
  useBuyerOrdersMock.mockReset();
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
    items: [],
    shipment_groups: [],
    total_amount_human: "70.0",
    total_commission_human: "1.26",
    ...overrides,
  };
}

describe("OrdersPage state machine", () => {
  it("shows the not-connected message when wallet is not in MiniPay", () => {
    useMinipayMock.mockReturnValue({
      isInMinipay: false,
      isConnected: false,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({ address: undefined });
    useBuyerOrdersMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    render(<OrdersPage />);
    expect(
      screen.getByText(/please open this app from minipay/i),
    ).toBeInTheDocument();
  });

  it("shows the in-MiniPay-but-connect-failed message", () => {
    useMinipayMock.mockReturnValue({
      isInMinipay: true,
      isConnected: false,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({ address: undefined });
    useBuyerOrdersMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    render(<OrdersPage />);
    expect(
      screen.getByText(/unable to connect\. please reopen minipay/i),
    ).toBeInTheDocument();
  });

  it("shows the empty state when connected with zero orders", () => {
    useMinipayMock.mockReturnValue({
      isInMinipay: true,
      isConnected: true,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({
      address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    });
    useBuyerOrdersMock.mockReturnValue({
      data: { items: [], count: 0, limit: 20, offset: 0 },
      isLoading: false,
      isError: false,
    });

    render(<OrdersPage />);
    expect(screen.getByTestId("orders-empty-state")).toBeInTheDocument();
  });

  it("renders OrderCard list when data is populated", () => {
    useMinipayMock.mockReturnValue({
      isInMinipay: true,
      isConnected: true,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({
      address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    });
    useBuyerOrdersMock.mockReturnValue({
      data: {
        items: [
          makeOrder({ id: "a", seller_handle: "chioma" }),
          makeOrder({ id: "b", seller_handle: "aissa" }),
        ],
        count: 2,
        limit: 20,
        offset: 0,
      },
      isLoading: false,
      isError: false,
    });

    render(<OrdersPage />);
    expect(screen.getByTestId("orders-list")).toBeInTheDocument();
    expect(screen.getByText("@chioma")).toBeInTheDocument();
    expect(screen.getByText("@aissa")).toBeInTheDocument();
  });

  it("renders the loading state while fetching", () => {
    useMinipayMock.mockReturnValue({
      isInMinipay: true,
      isConnected: true,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({
      address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    });
    useBuyerOrdersMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<OrdersPage />);
    expect(screen.getByTestId("orders-loading-state")).toBeInTheDocument();
  });

  it("renders an error message + retry CTA when query errors", () => {
    useMinipayMock.mockReturnValue({
      isInMinipay: true,
      isConnected: true,
      isConnecting: false,
    });
    useAccountMock.mockReturnValue({
      address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    });
    const refetch = vi.fn();
    useBuyerOrdersMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Backend down"),
      refetch,
    });

    render(<OrdersPage />);
    expect(screen.getByTestId("orders-error")).toBeInTheDocument();
    expect(screen.getByText(/backend down/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
