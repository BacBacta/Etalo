/**
 * Vitest specs for OverviewTab — J10-V5 Phase 3 Block 3b regression-guard.
 *
 * Critical spec : Recent orders block must distinguish recent === null
 * (fetch in flight → SkeletonV5 row stack) vs recent.orders.length === 0
 * (genuine empty → "No orders yet" copy). Block 3b fixed the same
 * false-empty flash that affected OrdersTab.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OverviewTab } from "@/components/seller/OverviewTab";

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

const ADDRESS = "0xabc0000000000000000000000000000000000001";

const PROFILE = {
  shop_handle: "test-shop",
  display_name: "Test Shop",
  bio: null,
  avatar_url: null,
  region_country: "NG",
  whatsapp_number: null,
  instagram_handle: null,
  tiktok_handle: null,
  created_at: "2026-04-01T00:00:00Z",
};

const ONCHAIN = {
  wallet: ADDRESS,
  reputation: { score: 0, total_orders: 0, completed_orders: 0 },
  stake: {
    tier: "None",
    amount_human: "0",
    amount_raw: "0",
    locked_until: null,
  },
  recent_orders_count: 0,
} as const;

beforeEach(() => {
  fetchSellerOrdersMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OverviewTab — false-empty regression-guard (Block 3b)", () => {
  it("shows skeleton stack while recent === null (fetch in flight), NOT empty state", () => {
    fetchSellerOrdersMock.mockReturnValue(new Promise(() => {}));
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub for unused profile prop
        profile={PROFILE}
        // @ts-expect-error — minimal stub for unused onchain.profile fields
        onchain={ONCHAIN}
        address={ADDRESS}
      />,
    );
    expect(screen.getByTestId("overview-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/No orders yet/i)).not.toBeInTheDocument();
  });

  it("shows 'No orders yet' once recent resolves with []", async () => {
    fetchSellerOrdersMock.mockResolvedValue({
      orders: [],
      pagination: { total: 0, has_more: false, next_cursor: null },
    });
    render(
      <OverviewTab
        // @ts-expect-error — minimal stub
        profile={PROFILE}
        // @ts-expect-error — minimal stub
        onchain={ONCHAIN}
        address={ADDRESS}
      />,
    );
    expect(screen.getByTestId("overview-skeleton")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("overview-skeleton")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/No orders yet/i)).toBeInTheDocument();
  });
});
