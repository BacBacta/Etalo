/**
 * OrdersEmptyState — J11.5 Block 3.F.
 *
 * Light test : the component is mostly a thin wrapper around the
 * already-tested EmptyStateV5 with hard-coded illustration + copy.
 * We only assert the integration contract (right asset, right CTA).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrdersEmptyState } from "@/components/orders/OrdersEmptyState";

describe("OrdersEmptyState", () => {
  it("renders the no-orders illustration asset", () => {
    render(<OrdersEmptyState />);
    const illustration = screen.getByTestId("empty-illustration");
    expect(illustration).toHaveAttribute("data-asset", "no-orders");
  });

  it("renders the marketplace CTA pointing to /marketplace", () => {
    render(<OrdersEmptyState />);
    const cta = screen.getByTestId("empty-state-action");
    expect(cta).toHaveAttribute("href", "/marketplace");
  });

  it("surfaces a buyer-friendly title (no jargon)", () => {
    render(<OrdersEmptyState />);
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
  });
});
