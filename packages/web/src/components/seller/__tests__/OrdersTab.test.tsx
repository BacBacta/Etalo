/**
 * Vitest specs for OrdersTab.
 *
 * Tab-switch perf hotfix (post-PR #29) : the data layer is now backed
 * by `useSellerOrders` (TanStack Query) instead of a raw useState +
 * useEffect + fetchSellerOrders pair. Tests mock the hook directly so
 * we don't need a QueryClientProvider scaffold + can drive the
 * isPending / data states deterministically per spec.
 *
 * Critical contracts preserved across the refactor :
 *  - the loading state (isPending) renders the SkeletonV5 row stack,
 *    NOT the "No orders yet" empty state (Block 3b regression-guard)
 *  - the first-sale milestone fires on the 0 → 1+ transition
 *    (Block 6 sub-block 6.3)
 *  - anonymized buyer label, deadline countdown, line_items inline,
 *    aggregate banner, pick-list view (PR #26)
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrdersTab } from "@/components/seller/OrdersTab";
import type { SellerOrdersPage } from "@/lib/seller-api";

// ============================================================
// Mocks
// ============================================================
const useSellerOrdersMock = vi.fn();
vi.mock("@/hooks/useSellerOrders", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/useSellerOrders")
  >("@/hooks/useSellerOrders");
  return {
    ...actual,
    useSellerOrders: (...args: unknown[]) => useSellerOrdersMock(...args),
  };
});

// useQueryClient stub — invoked inside OrdersTab for the
// invalidate-on-mark-shipped path. Doesn't need a real provider
// since we don't drive any mutation in these specs.
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

const fireMilestoneMock = vi.fn();
vi.mock("@/lib/confetti/milestones", () => ({
  fireMilestone: (...args: unknown[]) => fireMilestoneMock(...args),
}));

const useMilestoneOnceMock = vi.fn();
vi.mock("@/hooks/useMilestoneOnce", () => ({
  useMilestoneOnce: (...args: unknown[]) => useMilestoneOnceMock(...args),
}));

// ============================================================
// Helpers
// ============================================================
type HookState =
  | { kind: "pending" }
  | { kind: "success"; data: SellerOrdersPage }
  | { kind: "error" };

function applyHookState(state: HookState | HookState[]) {
  if (Array.isArray(state)) {
    // Chain : each render call pops the next state. The last entry
    // sticks for any subsequent call (matches `mockReturnValueOnce`
    // semantics with a final fallback).
    let i = 0;
    useSellerOrdersMock.mockImplementation(() => {
      const s = state[Math.min(i, state.length - 1)];
      i += 1;
      return shape(s);
    });
    return;
  }
  useSellerOrdersMock.mockReturnValue(shape(state));
}

function shape(s: HookState) {
  switch (s.kind) {
    case "pending":
      return {
        data: undefined,
        isPending: true,
        isError: false,
        isSuccess: false,
        error: null,
        refetch: vi.fn(),
      };
    case "error":
      return {
        data: undefined,
        isPending: false,
        isError: true,
        isSuccess: false,
        error: new Error("network"),
        refetch: vi.fn(),
      };
    case "success":
      return {
        data: s.data,
        isPending: false,
        isError: false,
        isSuccess: true,
        error: null,
        refetch: vi.fn(),
      };
  }
}

const ADDRESS = "0xabc0000000000000000000000000000000000001";

const EMPTY_PAGE: SellerOrdersPage = {
  orders: [],
  pagination: { total: 0, has_more: false, next_cursor: null } as never,
};

beforeEach(() => {
  useSellerOrdersMock.mockReset();
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

// ============================================================
// Loading / empty state regression-guard (Block 3b origin)
// ============================================================
describe("OrdersTab — loading + empty states", () => {
  it("shows skeleton stack while the query is pending, NOT the empty state", () => {
    applyHookState({ kind: "pending" });
    render(<OrdersTab address={ADDRESS} />);
    expect(screen.getByTestId("orders-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/No orders/i)).not.toBeInTheDocument();
  });

  it("shows the empty-state copy once the query resolves with []", async () => {
    applyHookState({ kind: "success", data: EMPTY_PAGE });
    render(<OrdersTab address={ADDRESS} />);
    await waitFor(() =>
      expect(screen.queryByTestId("orders-skeleton")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/No orders yet/i)).toBeInTheDocument();
  });

  it("renders EmptyStateV5 no-orders illustration when [] (no filter applied)", async () => {
    applyHookState({ kind: "success", data: EMPTY_PAGE });
    render(<OrdersTab address={ADDRESS} />);
    const img = await screen.findByTestId("empty-illustration");
    expect(img).toHaveAttribute("data-asset", "no-orders");
    expect(
      screen.getByRole("heading", { name: /No orders yet/i }),
    ).toBeInTheDocument();
  });

  it("falls back to plain copy when filter is set (no illustration)", async () => {
    applyHookState({ kind: "success", data: EMPTY_PAGE });
    render(<OrdersTab address={ADDRESS} />);
    await screen.findByText(/No orders yet/i);
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

  it("re-shows skeleton when the query flips to error after a filter change", async () => {
    // First render is success [], filter change triggers a state flip
    // to error → component falls back to the loading skeleton (the
    // hook's error branch is collapsed into the same null-data path
    // the previous useState/useEffect implementation used).
    applyHookState([
      { kind: "success", data: EMPTY_PAGE },
      { kind: "error" },
    ]);
    render(<OrdersTab address={ADDRESS} />);
    await screen.findByText(/No orders yet/i);
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

const ORDER_FIXTURE: SellerOrdersPage["orders"][number] = {
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
} as never;

describe("OrdersTab — first-sale milestone dialog (Block 6 sub-block 6.3)", () => {
  it("opens MilestoneDialogV5 + fires confetti on the 0 → 1 transition when shouldShow=true", async () => {
    useMilestoneOnceMock.mockReturnValue({
      shouldShow: true,
      markShown: vi.fn(),
    });
    // First state : empty page (establishes prev=0 in the ref).
    // Second state : after filter change, list of 1 — triggers the
    // 0 → 1 transition.
    applyHookState([
      { kind: "success", data: EMPTY_PAGE },
      {
        kind: "success",
        data: {
          orders: [ORDER_FIXTURE],
          pagination: { total: 1, has_more: false, next_cursor: null } as never,
        },
      },
    ]);
    render(<OrdersTab address={ADDRESS} />);
    await screen.findByText(/No orders yet/i);
    expect(fireMilestoneMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("milestone-dialog")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Filter:/i), {
      target: { value: "Completed" },
    });

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
    applyHookState([
      { kind: "success", data: EMPTY_PAGE },
      {
        kind: "success",
        data: {
          orders: [ORDER_FIXTURE],
          pagination: { total: 1, has_more: false, next_cursor: null } as never,
        },
      },
    ]);
    render(<OrdersTab address={ADDRESS} />);
    await screen.findByText(/No orders yet/i);
    fireEvent.change(screen.getByLabelText(/Filter:/i), {
      target: { value: "Completed" },
    });
    await waitFor(() =>
      expect(fireMilestoneMock).toHaveBeenCalledWith("first-sale"),
    );
    expect(screen.queryByTestId("milestone-dialog")).not.toBeInTheDocument();
  });

  it("CTA click fires markShown — the persistent guard is updated and the dialog closes", async () => {
    const markShownSpy = vi.fn();
    useMilestoneOnceMock.mockReturnValue({
      shouldShow: true,
      markShown: markShownSpy,
    });
    applyHookState([
      { kind: "success", data: EMPTY_PAGE },
      {
        kind: "success",
        data: {
          orders: [ORDER_FIXTURE],
          pagination: { total: 1, has_more: false, next_cursor: null } as never,
        },
      },
    ]);
    render(<OrdersTab address={ADDRESS} />);
    await screen.findByText(/No orders yet/i);
    fireEvent.change(screen.getByLabelText(/Filter:/i), {
      target: { value: "Completed" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("milestone-dialog")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("milestone-dialog-cta"));

    expect(markShownSpy).toHaveBeenCalledTimes(1);
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

const FUNDED_ORDER: SellerOrdersPage["orders"][number] = {
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
} as never;

describe("OrdersTab — anonymized buyer + deadline + line items (Block 8 hotfix)", () => {
  function applyFundedOrder() {
    applyHookState({
      kind: "success",
      data: {
        orders: [FUNDED_ORDER],
        pagination: { total: 1, has_more: false, next_cursor: null } as never,
      },
    });
  }

  it("renders the anonymized 'Buyer in {city}, {country}' label, never the raw 0x address", async () => {
    applyFundedOrder();
    render(<OrdersTab address={ADDRESS} />);
    expect(
      await screen.findByText(/Buyer in Lagos, Nigeria/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/0xbuyer/)).toBeNull();
  });

  it("renders the inline line_items breakdown so the seller knows what to ship", async () => {
    applyFundedOrder();
    render(<OrdersTab address={ADDRESS} />);
    const breakdown = await screen.findByTestId("order-row-line-items");
    expect(breakdown.textContent).toContain("Robe wax M");
    expect(breakdown.textContent).toContain("× 2");
    expect(breakdown.textContent).toContain("Sandales 38");
    expect(breakdown.textContent).toContain("× 1");
  });

  it("renders the seller-inactivity deadline badge for shippable orders", async () => {
    applyFundedOrder();
    render(<OrdersTab address={ADDRESS} />);
    const badge = await screen.findByTestId("order-row-deadline");
    expect(badge.textContent).toMatch(
      /Ship in .* or order auto-refunds|Past auto-refund deadline/,
    );
  });

  it("renders the aggregate banner with totals when at least one shippable order is present", async () => {
    applyFundedOrder();
    render(<OrdersTab address={ADDRESS} />);
    const banner = await screen.findByTestId("orders-aggregate-banner");
    expect(banner.textContent).toContain("To ship: 1 order");
    expect(banner.textContent).toContain("3 articles");
  });

  it("toggles into the pick-list view and aggregates SKUs by title across orders", async () => {
    applyHookState({
      kind: "success",
      data: {
        orders: [
          FUNDED_ORDER,
          {
            ...FUNDED_ORDER,
            id: "order-funded-2",
            onchain_order_id: 43,
            line_items: [
              { title: "Robe wax M", qty: 3, image_ipfs_hash: "QmRobe" },
            ],
          } as never,
        ],
        pagination: { total: 2, has_more: false, next_cursor: null } as never,
      },
    });
    render(<OrdersTab address={ADDRESS} />);
    await screen.findByTestId("orders-aggregate-banner");
    fireEvent.click(screen.getByRole("tab", { name: /Pick list/i }));
    const list = screen.getByTestId("pick-list");
    expect(list.textContent).toContain("Robe wax M");
    expect(list.textContent).toContain("× 5");
    expect(list.textContent).toContain("2 orders");
  });
});
