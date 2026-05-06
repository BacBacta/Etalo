/**
 * OrdersLoadingState — J11.5 Block 3.F.
 *
 * Asserts placeholder count + a11y. SkeletonV5 itself is covered by
 * its own specs ; here we only verify the wrapper contract.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrdersLoadingState } from "@/components/orders/OrdersLoadingState";

describe("OrdersLoadingState", () => {
  it("renders 3 row-variant skeleton placeholders", () => {
    render(<OrdersLoadingState />);
    // SkeletonV5 row variant renders role=status + aria-busy.
    const placeholders = screen.getAllByRole("status");
    expect(placeholders.length).toBeGreaterThanOrEqual(3);
  });

  it("attaches the orders-loading-state test id for page-level state checks", () => {
    render(<OrdersLoadingState />);
    expect(screen.getByTestId("orders-loading-state")).toBeInTheDocument();
  });
});
