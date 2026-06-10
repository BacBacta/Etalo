/**
 * useSellerOrders specs — covers the smart refetchInterval gate
 * introduced in Block A of the J12-pre reactivity sprint.
 *
 * The hook polls every 15 s while at least one order is in a transient
 * status (Funded / PartiallyShipped / AllShipped / PartiallyDelivered /
 * Disputed), and falls back to a steady 30 s when the list is quiet or
 * empty — so a brand-new incoming order surfaces live without the
 * seller having to re-navigate.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSellerOrders } from "@/hooks/useSellerOrders";
import type { SellerOrdersPage } from "@/lib/seller-api";

const fetchSellerOrdersMock = vi.fn();

vi.mock("@/lib/seller-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/seller-api")>(
    "@/lib/seller-api",
  );
  return {
    ...actual,
    fetchSellerOrders: (...args: unknown[]) => fetchSellerOrdersMock(...args),
  };
});

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

const TEST_WALLET = "0xabc1234567890abcdef1234567890abcdef12345";

function makePage(statuses: string[]): SellerOrdersPage {
  return {
    orders: statuses.map((status, idx) => ({
      id: `order-${idx}`,
      onchain_order_id: idx + 1,
      global_status: status,
      total_amount_usdt: 1_000_000,
      created_at_chain: "2026-05-20T00:00:00Z",
      funded_at: status === "Created" ? null : "2026-05-20T00:00:00Z",
      item_count: 1,
      line_items: [],
      delivery_address_snapshot: null,
    })) as unknown as SellerOrdersPage["orders"],
    pagination: {
      page: 1,
      page_size: 20,
      total: statuses.length,
      has_more: false,
    },
  };
}

describe("useSellerOrders refetchInterval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchSellerOrdersMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("polls every 15 s while at least one order is transient", async () => {
    fetchSellerOrdersMock.mockResolvedValue(makePage(["Funded"]));
    const wrapper = makeWrapper();

    renderHook(() => useSellerOrders({ address: TEST_WALLET }), { wrapper });

    // Initial fetch (resolved by microtask after timer advance).
    await vi.waitFor(() =>
      expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(1),
    );

    // Advance one polling cycle.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(2);

    // And another.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(3);
  });

  it("polls every 30 s when all orders are terminal (to catch new ones)", async () => {
    fetchSellerOrdersMock.mockResolvedValue(makePage(["Completed", "Refunded"]));
    const wrapper = makeWrapper();

    renderHook(() => useSellerOrders({ address: TEST_WALLET }), { wrapper });

    await vi.waitFor(() =>
      expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(1),
    );

    // No fast (15 s) poll on a quiet list…
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(1);

    // …but the steady 30 s cycle still fires so a fresh order shows up.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(2);
  });

  it("polls every 30 s on an empty list (to catch the first order)", async () => {
    fetchSellerOrdersMock.mockResolvedValue(makePage([]));
    const wrapper = makeWrapper();

    renderHook(() => useSellerOrders({ address: TEST_WALLET }), { wrapper });

    await vi.waitFor(() =>
      expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(1),
    );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchSellerOrdersMock).toHaveBeenCalledTimes(2);
  });

  it("does not fetch when address is missing", () => {
    const wrapper = makeWrapper();
    renderHook(() => useSellerOrders({ address: undefined as unknown as string }), {
      wrapper,
    });
    expect(fetchSellerOrdersMock).not.toHaveBeenCalled();
  });
});

// Side note : we also assert the hook still returns a sane shape so
// that the `data` consumers in OrdersTab / OverviewTab do not have to
// guard differently after this change.
describe("useSellerOrders shape", () => {
  beforeEach(() => {
    fetchSellerOrdersMock.mockReset();
  });

  it("returns the SellerOrdersPage payload as `data`", async () => {
    const page = makePage(["Funded"]);
    fetchSellerOrdersMock.mockResolvedValue(page);
    const wrapper = makeWrapper();

    const { result } = renderHook(
      () => useSellerOrders({ address: TEST_WALLET }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(page);
  });
});
