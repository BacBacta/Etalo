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

const fireMilestoneMock = vi.fn();
vi.mock("@/lib/confetti/milestones", () => ({
  fireMilestone: (...args: unknown[]) => fireMilestoneMock(...args),
}));

// Block 6 sub-block 6.3 — control useMilestoneOnce per spec so the
// dialog wire-up is testable independently of the localStorage
// hydration timing (the hook itself has its own 5 specs in
// hooks/__tests__/useMilestoneOnce.test.tsx). markShownMock is
// re-created per spec so click-count assertions stay isolated.
const useMilestoneOnceMock = vi.fn();
vi.mock("@/hooks/useMilestoneOnce", () => ({
  useMilestoneOnce: (...args: unknown[]) => useMilestoneOnceMock(...args),
}));

const ADDRESS = "0xabc0000000000000000000000000000000000001";

beforeEach(() => {
  fetchSellerOrdersMock.mockReset();
  fireMilestoneMock.mockReset();
  useMilestoneOnceMock.mockReset();
  // Default the hook to "guard says don't show" so the existing
  // Block 3b regression specs aren't perturbed by the milestone
  // dialog opening on the empty-orders fixture path. The new Block
  // 6.3 specs override per-spec.
  useMilestoneOnceMock.mockReturnValue({
    shouldShow: false,
    markShown: vi.fn(),
  });
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

// ============================================================
// Block 6 sub-block 6.3 — first-sale milestone dialog wire-up
// ============================================================

const ORDER_FIXTURE = {
  id: "order-1",
  onchain_order_id: 1,
  buyer_address: "0xbuyer000000000000000000000000000000000001",
  total_amount_usdt: 70_000_000,
  global_status: "Completed",
  created_at_chain: "2026-05-01T10:00:00Z",
  item_count: 1,
  is_cross_border: false,
  funded_at: null,
  delivery_address_snapshot: null,
  line_items: [],
};

describe("OrdersTab — first-sale milestone dialog (Block 6 sub-block 6.3)", () => {
  it("opens MilestoneDialogV5 + fires confetti on the 0 → 1 transition when shouldShow=true", async () => {
    useMilestoneOnceMock.mockReturnValue({
      shouldShow: true,
      markShown: vi.fn(),
    });
    // First fetch lands with [] — establishes prev=0 in the ref.
    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [],
      pagination: { total: 0, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );
    // No transition yet, no confetti, no dialog.
    expect(fireMilestoneMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("milestone-dialog")).not.toBeInTheDocument();

    // Trigger 0 → 1 transition via filter change refetch.
    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [ORDER_FIXTURE],
      pagination: { total: 1, has_more: false, next_cursor: null },
    });
    fireEvent.change(screen.getByLabelText(/Filter:/i), {
      target: { value: "Completed" },
    });

    // Confetti AND dialog — the Block 6.3 contract.
    await waitFor(() =>
      expect(fireMilestoneMock).toHaveBeenCalledWith("first-sale"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("milestone-dialog")).toBeInTheDocument(),
    );
    expect(screen.getByText(/First sale!/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Congratulations on your first completed order/i),
    ).toBeInTheDocument();
  });

  it("fires confetti but does NOT open the dialog when shouldShow=false (already-seen guard)", async () => {
    useMilestoneOnceMock.mockReturnValue({
      shouldShow: false,
      markShown: vi.fn(),
    });
    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [],
      pagination: { total: 0, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );

    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [ORDER_FIXTURE],
      pagination: { total: 1, has_more: false, next_cursor: null },
    });
    fireEvent.change(screen.getByLabelText(/Filter:/i), {
      target: { value: "Completed" },
    });

    // Confetti still fires — additive, not gated by the dialog guard.
    await waitFor(() =>
      expect(fireMilestoneMock).toHaveBeenCalledWith("first-sale"),
    );
    // Dialog stays hidden because the seller has already been shown
    // the celebration in a prior session.
    expect(screen.queryByTestId("milestone-dialog")).not.toBeInTheDocument();
  });

  it("CTA click fires markShown — the persistent guard is updated and the dialog closes", async () => {
    const markShownSpy = vi.fn();
    useMilestoneOnceMock.mockReturnValue({
      shouldShow: true,
      markShown: markShownSpy,
    });
    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [],
      pagination: { total: 0, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );

    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [ORDER_FIXTURE],
      pagination: { total: 1, has_more: false, next_cursor: null },
    });
    fireEvent.change(screen.getByLabelText(/Filter:/i), {
      target: { value: "Completed" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("milestone-dialog")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("milestone-dialog-cta"));

    expect(markShownSpy).toHaveBeenCalledTimes(1);
    // MilestoneDialogV5 propagates onOpenChange(false) immediately
    // after firing onCtaClick, so the dialog leaves the DOM in the
    // same React batch.
    await waitFor(() =>
      expect(screen.queryByTestId("milestone-dialog")).not.toBeInTheDocument(),
    );
  });
});

// ============================================================
// fix/seller-orders-delivery-info — orders dashboard UX upgrade :
// anonymized buyer (rule 5), aggregate banner, deadline countdown,
// inline line_items breakdown, pick-list view toggle.
// ============================================================

const FUNDED_ORDER = {
  id: "order-funded-1",
  onchain_order_id: 42,
  buyer_address: "0xbuyer000000000000000000000000000000000042",
  total_amount_usdt: 25_000_000,
  global_status: "Funded",
  created_at_chain: "2026-05-01T10:00:00Z",
  funded_at: "2026-05-01T10:00:00Z",
  item_count: 3,
  is_cross_border: false,
  delivery_address_snapshot: {
    city: "Lagos",
    country: "NGA",
    address_line: "12 Allen Avenue",
    phone_number: "+2349011234567",
  },
  line_items: [
    { title: "Robe wax M", qty: 2, image_ipfs_hash: "QmRobe" },
    { title: "Sandales 38", qty: 1, image_ipfs_hash: null },
  ],
};

describe("OrdersTab — anonymized buyer + deadline + line items (Block 8 hotfix)", () => {
  it("renders the anonymized 'Buyer in {city}, {country}' label, never the raw 0x address", async () => {
    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [FUNDED_ORDER],
      pagination: { total: 1, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Buyer in Lagos, Nigeria/)).toBeInTheDocument();
    // Rule 5 — never surface a raw 0x… string to the seller UI.
    expect(screen.queryByText(/0xbuyer/)).toBeNull();
  });

  it("renders the inline line_items breakdown so the seller knows what to ship", async () => {
    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [FUNDED_ORDER],
      pagination: { total: 1, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );
    const breakdown = screen.getByTestId("order-row-line-items");
    expect(breakdown).toBeInTheDocument();
    expect(breakdown.textContent).toContain("Robe wax M");
    expect(breakdown.textContent).toContain("× 2");
    expect(breakdown.textContent).toContain("Sandales 38");
    expect(breakdown.textContent).toContain("× 1");
  });

  it("renders the seller-inactivity deadline badge for shippable orders", async () => {
    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [FUNDED_ORDER],
      pagination: { total: 1, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );
    const badge = screen.getByTestId("order-row-deadline");
    expect(badge.textContent).toMatch(/Ship in .* or order auto-refunds|Past auto-refund deadline/);
  });

  it("renders the aggregate banner with totals when at least one shippable order is present", async () => {
    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [FUNDED_ORDER],
      pagination: { total: 1, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );
    const banner = screen.getByTestId("orders-aggregate-banner");
    expect(banner.textContent).toContain("To ship: 1 order");
    // 2 + 1 = 3 articles across the line_items.
    expect(banner.textContent).toContain("3 articles");
  });

  it("toggles into the pick-list view and aggregates SKUs by title across orders", async () => {
    fetchSellerOrdersMock.mockResolvedValueOnce({
      orders: [
        FUNDED_ORDER,
        {
          ...FUNDED_ORDER,
          id: "order-funded-2",
          onchain_order_id: 43,
          line_items: [
            { title: "Robe wax M", qty: 3, image_ipfs_hash: "QmRobe" },
          ],
        },
      ],
      pagination: { total: 2, has_more: false, next_cursor: null },
    });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("tab", { name: /Pick list/i }));
    const list = screen.getByTestId("pick-list");
    // Robe wax M = 2 + 3 = 5 across 2 orders.
    expect(list.textContent).toContain("Robe wax M");
    expect(list.textContent).toContain("× 5");
    expect(list.textContent).toContain("2 orders");
  });
});
