/**
 * Vitest specs for EmptyStateV5 (J10-V5 Phase 3 Block 5a).
 *
 * Coverage: title + description rendering, decorative illustration alt,
 * onClick action variant fires callback, href action variant renders
 * an anchor, compact variant applies smaller layout.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  EmptyStateV5,
  EMPTY_STATE_ASSET_PATH,
} from "@/components/ui/v5/EmptyState";

describe("EmptyStateV5", () => {
  it("renders title + description with the illustration as decorative", () => {
    render(
      <EmptyStateV5
        illustration="no-orders"
        title="No orders yet"
        description="Share your boutique link to get your first sale."
      />,
    );
    expect(screen.getByRole("heading", { name: /No orders yet/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Share your boutique link/i),
    ).toBeInTheDocument();

    const img = screen.getByTestId("empty-illustration");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img).toHaveAttribute("src", EMPTY_STATE_ASSET_PATH["no-orders"]);
    expect(img).toHaveAttribute("loading", "lazy");

    const region = screen.getByRole("region", { name: /No orders yet/i });
    expect(region).toBeInTheDocument();
  });

  it("maps each asset enum value to the expected SVG path", () => {
    const assets = [
      "no-orders",
      "no-products",
      "no-marketing",
      "no-stake",
    ] as const;
    for (const asset of assets) {
      const { unmount } = render(
        <EmptyStateV5 illustration={asset} title={`Empty ${asset}`} />,
      );
      const img = screen.getByTestId("empty-illustration");
      expect(img).toHaveAttribute("src", `/illustrations/v5/empty-${asset}.svg`);
      expect(img).toHaveAttribute("data-asset", asset);
      unmount();
    }
  });

  it("onClick action variant fires the callback on click", () => {
    const onClick = vi.fn();
    render(
      <EmptyStateV5
        illustration="no-products"
        title="No products yet"
        action={{ label: "Add product", onClick }}
      />,
    );
    const btn = screen.getByTestId("empty-state-action");
    expect(btn).toHaveTextContent(/Add product/i);
    expect(btn.tagName).toBe("BUTTON");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("href action variant renders an anchor with the right href", () => {
    render(
      <EmptyStateV5
        illustration="no-products"
        title="No products yet"
        action={{ label: "Add product", href: "/seller/products/new" }}
      />,
    );
    const link = screen.getByTestId("empty-state-action");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/seller/products/new");
    expect(link).toHaveTextContent(/Add product/i);
  });

  it("compact variant applies smaller image cap + display-4 title size", () => {
    render(
      <EmptyStateV5
        illustration="no-orders"
        title="No orders"
        variant="compact"
      />,
    );
    const region = screen.getByRole("region", { name: /No orders/i });
    expect(region).toHaveAttribute("data-variant", "compact");
    expect(region.className).toMatch(/max-w-sm/);
    expect(region.className).toMatch(/gap-3/);

    const img = screen.getByTestId("empty-illustration");
    expect(img.className).toMatch(/max-w-\[80px\]/);

    const heading = screen.getByRole("heading", { name: /No orders/i });
    expect(heading.className).toMatch(/text-display-4/);
  });
});
