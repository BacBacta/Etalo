/**
 * useNewSellerOrderAlerts specs — the proactive new-order signal.
 *
 * Baseline: the first successful load must NOT alert (those are the
 * seller's pre-existing orders). A later poll that surfaces an unseen
 * order ID fires one toast and bumps the unread count; markSeen() clears
 * it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNewSellerOrderAlerts } from "@/hooks/useNewSellerOrderAlerts";
import type { SellerOrdersPage } from "@/lib/seller-api";

const fetchSellerOrdersMock = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/lib/seller-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/seller-api")>(
    "@/lib/seller-api",
  );
  return {
    ...actual,
    fetchSellerOrders: (...args: unknown[]) => fetchSellerOrdersMock(...args),
  };
});

vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

const WALLET = "0xabc1234567890abcdef1234567890abcdef12345";

function makePage(ids: number[]): SellerOrdersPage {
  return {
    orders: ids.map((id) => ({
      id: `order-${id}`,
      onchain_order_id: id,
      global_status: "Funded",
      total_amount_usdt: 1_000_000,
      created_at_chain: "2026-06-10T00:00:00Z",
      funded_at: "2026-06-10T00:00:00Z",
      item_count: 1,
      line_items: [],
      delivery_address_snapshot: null,
    })) as unknown as SellerOrdersPage["orders"],
    pagination: { page: 1, page_size: 20, total: ids.length, has_more: false },
  };
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useNewSellerOrderAlerts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchSellerOrdersMock.mockReset();
    toastSuccess.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not alert on the first load (existing orders are baseline)", async () => {
    fetchSellerOrdersMock.mockResolvedValue(makePage([1, 2]));
    const { result } = renderHook(() => useNewSellerOrderAlerts(WALLET), {
      wrapper: makeWrapper(),
    });
    await vi.waitFor(() =>
      expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(1),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(result.current.newCount).toBe(0);
  });

  it("toasts + bumps the count when a new order appears", async () => {
    fetchSellerOrdersMock.mockResolvedValueOnce(makePage([1]));
    fetchSellerOrdersMock.mockResolvedValue(makePage([2, 1])); // #2 is new
    const { result } = renderHook(() => useNewSellerOrderAlerts(WALLET), {
      wrapper: makeWrapper(),
    });
    await vi.waitFor(() =>
      expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(1),
    );

    // Transient (Funded) list polls every 15 s.
    await vi.advanceTimersByTimeAsync(15_000);

    await vi.waitFor(() => expect(result.current.newCount).toBe(1));
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith(
      "New order · #2",
      expect.objectContaining({ description: expect.stringContaining("USDT") }),
    );
  });

  it("markSeen resets the unread count", async () => {
    fetchSellerOrdersMock.mockResolvedValueOnce(makePage([1]));
    fetchSellerOrdersMock.mockResolvedValue(makePage([2, 1]));
    const { result } = renderHook(() => useNewSellerOrderAlerts(WALLET), {
      wrapper: makeWrapper(),
    });
    await vi.waitFor(() =>
      expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(1),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => expect(result.current.newCount).toBe(1));

    act(() => result.current.markSeen());
    expect(result.current.newCount).toBe(0);
  });
});
