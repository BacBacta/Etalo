/**
 * OrderStatusBadge — J11.5 Block 3.F.
 *
 * Asserts the label + a11y mapping for every OrderStatus enum value
 * so a backend enum addition (or rename) breaks the test rather than
 * silently rendering an empty badge.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import type { OrderStatus } from "@/lib/orders/state";

const STATUSES: ReadonlyArray<{ status: OrderStatus; label: string }> = [
  { status: "Created", label: "Awaiting payment" },
  { status: "Funded", label: "Paid" },
  { status: "PartiallyShipped", label: "Partially shipped" },
  { status: "AllShipped", label: "Shipped" },
  { status: "PartiallyDelivered", label: "Partially delivered" },
  { status: "Completed", label: "Completed" },
  { status: "Disputed", label: "Dispute open" },
  { status: "Refunded", label: "Refunded" },
  { status: "Cancelled", label: "Cancelled" },
];

describe("OrderStatusBadge", () => {
  it.each(STATUSES)(
    "$status → renders label '$label' with aria + data attributes",
    ({ status, label }) => {
      render(<OrderStatusBadge status={status} />);
      const badge = screen.getByText(label);
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute("data-status", status);
      expect(badge).toHaveAttribute("aria-label", `Order status: ${label}`);
    },
  );

  it("Completed badge uses the success (emerald) color class", () => {
    render(<OrderStatusBadge status="Completed" />);
    const badge = screen.getByText("Completed");
    expect(badge.className).toContain("emerald");
  });

  it("Disputed badge uses the alert (rose) color class", () => {
    render(<OrderStatusBadge status="Disputed" />);
    const badge = screen.getByText("Dispute open");
    expect(badge.className).toContain("rose");
  });
});
