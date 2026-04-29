/**
 * Vitest specs for CardV4 + 5 sub-parts (J9 Block 3 Chunk 3c).
 *
 * Coverage: root variants (default/elevated/hero/dark), padding sizes,
 * interactive hover styles, sub-parts (Header/Title/Description/
 * Content/Footer) semantic structure, full composition.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CardContentV4,
  CardDescriptionV4,
  CardFooterV4,
  CardHeaderV4,
  CardTitleV4,
  CardV4,
} from "@/components/ui/v4/Card";

describe("CardV4 root", () => {
  it("renders with default variant + padding (rounded-3xl, shadow-celo-md, p-6, bg-celo-light)", () => {
    const { container } = render(<CardV4>content</CardV4>);
    const card = container.firstChild as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass("rounded-3xl");
    expect(card).toHaveClass("shadow-celo-md");
    expect(card).toHaveClass("p-6");
    expect(card).toHaveClass("bg-celo-light");
    expect(card).toHaveClass("text-celo-dark");
  });

  it("applies the correct classes for each variant", () => {
    const variants = [
      { variant: "elevated", expected: "shadow-celo-lg" },
      { variant: "hero", expected: "shadow-celo-hero" },
      { variant: "dark", expected: "bg-celo-dark" },
    ] as const;
    for (const { variant, expected } of variants) {
      const { container, unmount } = render(
        <CardV4 variant={variant}>card</CardV4>,
      );
      expect(container.firstChild).toHaveClass(expected);
      if (variant === "dark") {
        expect(container.firstChild).toHaveClass("text-celo-light");
      }
      unmount();
    }
  });

  it("applies compact padding when padding=compact", () => {
    const { container } = render(<CardV4 padding="compact">x</CardV4>);
    expect(container.firstChild).toHaveClass("p-4");
    expect(container.firstChild).not.toHaveClass("p-6");
  });

  it("applies interactive hover styles when interactive=true", () => {
    const { container } = render(<CardV4 interactive>x</CardV4>);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass("cursor-pointer");
    // J10-V5 Phase 2 Block 3: CSS hover:-translate-y-px removed —
    // motion drives whileHover y: -2 (V5 doc spec). The lift assertion
    // moved to the data-motion-active spec below.
    expect(card).toHaveClass("hover:shadow-celo-lg");
    expect(card).toHaveAttribute("data-interactive", "true");
  });
});

describe("Card sub-components", () => {
  it("renders CardHeader + CardTitle (h3) + CardDescription (text-body-sm + opacity-60)", () => {
    render(
      <CardHeaderV4>
        <CardTitleV4>Order #42</CardTitleV4>
        <CardDescriptionV4>Awaiting shipment</CardDescriptionV4>
      </CardHeaderV4>,
    );
    const title = screen.getByText("Order #42");
    expect(title.tagName).toBe("H3");
    expect(title).toHaveClass("font-display");
    expect(title).toHaveClass("text-display-4");

    const desc = screen.getByText("Awaiting shipment");
    expect(desc.tagName).toBe("P");
    expect(desc).toHaveClass("text-body-sm");
    expect(desc).toHaveClass("opacity-60");
  });

  it("renders CardFooter with border-top divider and flex justify-between", () => {
    const { container } = render(<CardFooterV4>actions</CardFooterV4>);
    const footer = container.firstChild as HTMLElement;
    expect(footer).toHaveClass("flex");
    expect(footer).toHaveClass("justify-between");
    expect(footer).toHaveClass("border-t");
    expect(footer).toHaveClass("pt-4");
  });
});

// J10-V5 Block 4c — dark variants asserted via class string presence
// (JSDom doesn't activate the `.dark` ancestor selector).
describe("CardV4 dark variants", () => {
  it("applies dark variant classes for default", () => {
    const { container } = render(<CardV4>x</CardV4>);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass("dark:bg-celo-dark-elevated");
    expect(card).toHaveClass("dark:text-celo-light");
    expect(card).toHaveClass("dark:border-celo-light/[8%]");
  });

  it("applies dark variant classes for elevated", () => {
    const { container } = render(<CardV4 variant="elevated">x</CardV4>);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass("dark:bg-celo-dark-elevated");
    expect(card).toHaveClass("dark:text-celo-light");
  });

  it("applies dark variant classes for hero", () => {
    const { container } = render(<CardV4 variant="hero">x</CardV4>);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass("dark:bg-celo-dark-elevated");
    expect(card).toHaveClass("dark:text-celo-light");
  });

  it("applies dark hover bg-surface bump on interactive=true (Robinhood raise feeling)", () => {
    const { container } = render(<CardV4 interactive>x</CardV4>);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass("dark:hover:bg-celo-dark-surface");
  });

  it("applies dark border on CardFooter", () => {
    const { container } = render(<CardFooterV4>actions</CardFooterV4>);
    const footer = container.firstChild as HTMLElement;
    expect(footer).toHaveClass("dark:border-celo-light/[8%]");
  });

  // J10-V5 Phase 2 Block 3 — motion control flow regression-guards.
  // JSDom doesn't execute motion's whileHover y: -2, so we test the
  // runtime decision via the data-motion-active marker rather than
  // asserting transform values directly.
  it("applies data-motion-active=true when interactive=true (motion enabled)", () => {
    const { container } = render(<CardV4 interactive>x</CardV4>);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute("data-motion-active", "true");
  });

  it("omits data-motion-active when interactive=false / default (motion bypassed)", () => {
    const { container } = render(<CardV4>x</CardV4>);
    const card = container.firstChild as HTMLElement;
    expect(card).not.toHaveAttribute("data-motion-active");
  });
});

describe("CardV4 full composition", () => {
  it("renders all 5 sub-parts in correct hierarchy", () => {
    render(
      <CardV4 variant="elevated" data-testid="card-root">
        <CardHeaderV4>
          <CardTitleV4>Next order</CardTitleV4>
          <CardDescriptionV4>Held safely in escrow</CardDescriptionV4>
        </CardHeaderV4>
        <CardContentV4>
          <p>Amount: $45.00</p>
        </CardContentV4>
        <CardFooterV4>
          <span>You receive: 44.19 USDT</span>
        </CardFooterV4>
      </CardV4>,
    );
    const root = screen.getByTestId("card-root");
    expect(root).toHaveClass("shadow-celo-lg");
    expect(screen.getByText("Next order").tagName).toBe("H3");
    expect(screen.getByText("Amount: $45.00")).toBeInTheDocument();
    expect(screen.getByText("You receive: 44.19 USDT")).toBeInTheDocument();
  });
});
