/**
 * Vitest specs for SheetV4 + 9 sub-parts (J9 Block 3 Chunk 3e).
 *
 * Coverage: trigger-driven open, side variants (right/left/top/bottom),
 * overlay backdrop, Escape close, Title + Description, dark header.
 * Mirrors DialogV4 testing strategy (defaultOpen for opened-state
 * assertions, screen queries through portal).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SheetV4,
  SheetV4Content,
  SheetV4Description,
  SheetV4Header,
  SheetV4Title,
  SheetV4Trigger,
} from "@/components/ui/v4/Sheet";

function Harness({
  defaultOpen = false,
  side,
}: {
  defaultOpen?: boolean;
  side?: "right" | "left" | "top" | "bottom";
}) {
  return (
    <SheetV4 defaultOpen={defaultOpen}>
      <SheetV4Trigger>Open sheet</SheetV4Trigger>
      <SheetV4Content side={side} data-testid="sheet-content">
        <SheetV4Header>
          <SheetV4Title>Cart</SheetV4Title>
          <SheetV4Description>Your cart contents</SheetV4Description>
        </SheetV4Header>
        <p>Items list</p>
      </SheetV4Content>
    </SheetV4>
  );
}

describe("SheetV4", () => {
  it("renders trigger but not content when closed", () => {
    render(<Harness />);
    expect(screen.getByText("Open sheet")).toBeInTheDocument();
    expect(screen.queryByText("Cart")).not.toBeInTheDocument();
  });

  it("opens sheet content when trigger is clicked (default side=right)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open sheet"));
    expect(screen.getByText("Cart")).toBeInTheDocument();
    const content = screen.getByTestId("sheet-content");
    expect(content).toHaveAttribute("data-side", "right");
    expect(content).toHaveClass("right-0");
    expect(content).toHaveClass("rounded-l-3xl");
  });

  it("right side variant has h-full + max-w-[400px] + rounded-l-3xl", () => {
    render(<Harness defaultOpen side="right" />);
    const content = screen.getByTestId("sheet-content");
    expect(content).toHaveClass("right-0");
    expect(content).toHaveClass("h-full");
    expect(content).toHaveClass("max-w-[400px]");
    expect(content).toHaveClass("rounded-l-3xl");
  });

  it("renders left, top, bottom side variants with correct classes", () => {
    const cases = [
      { side: "left" as const, expected: ["left-0", "rounded-r-3xl", "h-full"] },
      { side: "top" as const, expected: ["top-0", "rounded-b-3xl", "w-full"] },
      {
        side: "bottom" as const,
        expected: ["bottom-0", "rounded-t-3xl", "w-full"],
      },
    ];
    for (const { side, expected } of cases) {
      const { unmount } = render(<Harness defaultOpen side={side} />);
      const content = screen.getByTestId("sheet-content");
      for (const cls of expected) {
        expect(content).toHaveClass(cls);
      }
      expect(content).toHaveAttribute("data-side", side);
      unmount();
    }
  });

  it("Overlay has backdrop classes (bg-celo-dark/40, backdrop-blur-md)", () => {
    render(<Harness defaultOpen />);
    const overlay = document.querySelector('[data-state="open"].fixed.inset-0');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass("bg-celo-dark/40");
    expect(overlay).toHaveClass("backdrop-blur-md");
  });

  it("closes on Escape keydown", () => {
    render(<Harness defaultOpen />);
    expect(screen.getByText("Cart")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    expect(screen.queryByText("Cart")).not.toBeInTheDocument();
  });

  it("Title and Description have correct V4 classes", () => {
    render(<Harness defaultOpen />);
    const title = screen.getByText("Cart");
    expect(title).toHaveClass("font-display");
    expect(title).toHaveClass("text-display-4");
    const desc = screen.getByText("Your cart contents");
    expect(desc).toHaveClass("text-body-sm");
    expect(desc).toHaveClass("opacity-60");
  });

  it("dark Header variant applies dark bleed pattern (data-dark + classes)", () => {
    render(
      <SheetV4 defaultOpen>
        <SheetV4Trigger>x</SheetV4Trigger>
        <SheetV4Content>
          <SheetV4Header dark data-testid="header-dark">
            <SheetV4Title>Title</SheetV4Title>
            <SheetV4Description>Desc</SheetV4Description>
          </SheetV4Header>
        </SheetV4Content>
      </SheetV4>,
    );
    const header = screen.getByTestId("header-dark");
    expect(header).toHaveAttribute("data-dark", "true");
    expect(header).toHaveClass("bg-celo-dark");
    expect(header).toHaveClass("text-celo-light");
    expect(header).toHaveClass("rounded-t-3xl");
    // J10-V5 Block 4d Flag 3 — dark mode bleed = page bg (celo-dark-bg)
    // to keep the "deepest island" feel.
    expect(header).toHaveClass("dark:bg-celo-dark-bg");
  });

  // J10-V5 Block 4d — dark variants asserted via class string presence
  // (JSDom doesn't activate the `.dark` ancestor selector).
  it("Overlay applies dark backdrop class (bg-black/60 fintech-classic)", () => {
    render(<Harness defaultOpen />);
    const overlay = document.querySelector('[data-state="open"].fixed.inset-0');
    expect(overlay).toHaveClass("dark:bg-black/60");
  });

  it("Content applies dark variant classes (elevated bg + light text + subtle border) on default side=right", () => {
    render(<Harness defaultOpen />);
    const content = screen.getByTestId("sheet-content");
    expect(content).toHaveClass("dark:bg-celo-dark-elevated");
    expect(content).toHaveClass("dark:text-celo-light");
    expect(content).toHaveClass("dark:border-celo-light/[8%]");
  });

  it("All 4 side variants preserve dark base classes (cva base shared)", () => {
    const sides = ["right", "left", "top", "bottom"] as const;
    for (const side of sides) {
      const { unmount } = render(<Harness defaultOpen side={side} />);
      const content = screen.getByTestId("sheet-content");
      expect(content).toHaveClass("dark:bg-celo-dark-elevated");
      expect(content).toHaveClass("dark:text-celo-light");
      unmount();
    }
  });

  // J10-V5 Phase 2 Block 6 — motion control flow regression-guard.
  // JSDom doesn't execute motion (skipAnimations on in test setup), so
  // we test the runtime decision via data-motion-active + verify each
  // side variant resolves data-side without losing the marker.
  it("Content + Overlay carry data-motion-active across all 4 side variants (Block 6 motion entry)", () => {
    const sides = ["right", "left", "top", "bottom"] as const;
    for (const side of sides) {
      const { unmount } = render(<Harness defaultOpen side={side} />);
      const content = screen.getByTestId("sheet-content");
      expect(content).toHaveAttribute("data-motion-active");
      expect(content).toHaveAttribute("data-side", side);
      const overlay = document.querySelector(
        '[data-state="open"].fixed.inset-0',
      );
      expect(overlay).toHaveAttribute("data-motion-active");
      unmount();
    }
  });
});
