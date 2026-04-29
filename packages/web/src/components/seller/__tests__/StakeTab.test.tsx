/**
 * Vitest specs for StakeTab — J10-V5 Phase 3 Block 5b regression-guard.
 *
 * Asserts the !hasStake branch renders EmptyStateV5 no-stake (instead of
 * the prior tier card + plain "Deposit stake" button) and that the
 * primary CTA opens the StakeActionDialog deposit flow.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StakeTab } from "@/components/seller/StakeTab";

vi.mock("@/components/seller/StakeActionDialog", () => ({
  StakeActionDialog: ({ open, action }: { open: boolean; action: string }) =>
    open ? (
      <div data-testid="stake-dialog" data-action={action} />
    ) : null,
}));

const NO_STAKE = {
  wallet: "0xabc0000000000000000000000000000000000001",
  reputation: { score: 0, total_orders: 0, completed_orders: 0 },
  stake: {
    tier: "None",
    amount_human: "0",
    amount_raw: "0",
    locked_until: null,
    active_sales: 0,
  },
  recent_orders_count: 0,
} as const;

const HAS_STAKE = {
  ...NO_STAKE,
  stake: {
    tier: "Starter",
    amount_human: "10",
    amount_raw: "10000000",
    locked_until: null,
    active_sales: 0,
  },
} as const;

describe("StakeTab — !hasStake EmptyStateV5 (Block 5b)", () => {
  it("renders EmptyStateV5 no-stake when tier is None", () => {
    render(
      // @ts-expect-error — minimal stub for SellerProfileResponse
      <StakeTab onchain={NO_STAKE} onProfileRefresh={vi.fn()} />,
    );
    const img = screen.getByTestId("empty-illustration");
    expect(img).toHaveAttribute("data-asset", "no-stake");
    expect(
      screen.getByRole("heading", { name: /Top up your stake/i }),
    ).toBeInTheDocument();
  });

  it("CTA opens the StakeActionDialog with the deposit action", () => {
    render(
      // @ts-expect-error — minimal stub
      <StakeTab onchain={NO_STAKE} onProfileRefresh={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("empty-state-action"));
    const dialog = screen.getByTestId("stake-dialog");
    expect(dialog).toHaveAttribute("data-action", "deposit");
  });

  it("does NOT render the EmptyStateV5 when stake tier is set", () => {
    render(
      // @ts-expect-error — minimal stub
      <StakeTab onchain={HAS_STAKE} onProfileRefresh={vi.fn()} />,
    );
    expect(screen.queryByTestId("empty-illustration")).not.toBeInTheDocument();
    // Tier card renders instead.
    expect(screen.getByText(/Current tier: Starter/i)).toBeInTheDocument();
  });
});
