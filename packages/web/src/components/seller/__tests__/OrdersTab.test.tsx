/**
 * Vitest specs for OrdersTab — J10-V5 Phase 3 Block 3b regression-guard.
 *
 * Critical spec : the loading state (data === null while fetch in
 * flight) MUST render the SkeletonV5 row stack, NOT the
 * "No orders yet" empty state. Block 3b fixed a long-standing
 * false-empty flash where users saw "No orders yet" for ~200ms
 * before the fetch resolved.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrdersTab } from "@/components/seller/OrdersTab";

const fetchSellerOrdersMock = vi.fn();
vi.mock("@/lib/seller-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/seller-api")>(
      "@/lib/seller-api",
    );
  return {
    ...actual,
    fetchSellerOrders: (...args: unknown[]) => fetchSellerOrdersMock(...args),
  };
});

vi.mock("@/lib/confetti/milestones", () => ({
  fireMilestone: vi.fn(),
}));

const ADDRESS = "0xabc0000000000000000000000000000000000001";

beforeEach(() => {
  fetchSellerOrdersMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OrdersTab — false-empty regression-guard (Block 3b)", () => {
  it("shows skeleton stack while fetch is in flight (data === null), NOT empty state", () => {
    // Pending promise — the fetch never resolves during this assertion
    // window. data stays null, the loading branch must render.
    fetchSellerOrdersMock.mockReturnValue(new Promise(() => {}));
    render(<OrdersTab address={ADDRESS} />);
    expect(screen.getByTestId("orders-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/No orders/i)).not.toBeInTheDocument();
  });

  it("shows the empty-state copy once the fetch resolves with []", async () => {
    fetchSellerOrdersMock.mockResolvedValue({
      orders: [],
      pagination: { total: 0, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    expect(screen.getByTestId("orders-skeleton")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/No orders yet/i)).toBeInTheDocument();
  });

  it("renders EmptyStateV5 no-orders illustration when [] (no filter applied)", async () => {
    fetchSellerOrdersMock.mockResolvedValue({
      orders: [],
      pagination: { total: 0, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );
    const img = screen.getByTestId("empty-illustration");
    expect(img).toHaveAttribute("data-asset", "no-orders");
    expect(
      screen.getByRole("heading", { name: /No orders yet/i }),
    ).toBeInTheDocument();
  });

  it("falls back to plain copy when filter is set (no illustration)", async () => {
    fetchSellerOrdersMock.mockResolvedValue({
      orders: [],
      pagination: { total: 0, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );

    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [],
      pagination: { total: 0, has_more: false, next_cursor: null },
    });
    fireEvent.change(screen.getByLabelText(/Filter:/i), {
      target: { value: "Funded" },
    });
    await waitFor(() =>
      expect(
        screen.getByText(/No orders with status .*Funded/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("empty-illustration")).not.toBeInTheDocument();
  });

  it("re-shows skeleton on filter change → catch path (setData(null))", async () => {
    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [],
      pagination: { total: 0, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );

    // Trigger refetch via filter change — second call rejects, which
    // resets data to null in the catch handler.
    fetchSellerOrdersMock.mockRejectedValueOnce(new Error("network"));
    fireEvent.change(screen.getByLabelText(/Filter:/i), {
      target: { value: "Funded" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("orders-skeleton")).toBeInTheDocument(),
    );
  });
});
