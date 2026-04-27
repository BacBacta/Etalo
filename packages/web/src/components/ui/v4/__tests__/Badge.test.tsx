/**
 * Vitest specs for BadgeV4 (J9 Block 3 Chunk 3g).
 *
 * Coverage: default variant, all 4 variants color classes, dot prop
 * renders inline dot with bg-current, pulse adds animation class,
 * absence of dot when prop is omitted, ref forwarding.
 */
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BadgeV4 } from "@/components/ui/v4/Badge";

describe("BadgeV4", () => {
  it("renders default variant with rounded-pill + text-overline + neutral colors", () => {
    render(<BadgeV4>Network fee</BadgeV4>);
    const badge = screen.getByText("Network fee");
    expect(badge).toBeInTheDocument();
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("rounded-pill");
    expect(badge).toHaveClass("text-overline");
    expect(badge).toHaveClass("bg-celo-dark/[8%]");
    expect(badge).toHaveClass("text-celo-dark");
    expect(badge).toHaveClass("px-3");
    expect(badge).toHaveClass("py-1");
  });

  it("applies the correct color classes for each variant", () => {
    const variants = [
      { variant: "forest", bg: "bg-celo-forest-soft", text: "text-celo-forest" },
      { variant: "yellow", bg: "bg-celo-yellow-soft", text: "text-celo-dark" },
      { variant: "red", bg: "bg-celo-red-soft", text: "text-celo-red" },
    ] as const;
    for (const { variant, bg, text } of variants) {
      const { unmount } = render(
        <BadgeV4 variant={variant}>label</BadgeV4>,
      );
      const badge = screen.getByText("label");
      expect(badge).toHaveClass(bg);
      expect(badge).toHaveClass(text);
      unmount();
    }
  });

  it("renders the dot when dot=true (size-1.5 rounded-full bg-current)", () => {
    render(
      <BadgeV4 variant="forest" dot>
        Live
      </BadgeV4>,
    );
    const dot = screen.getByTestId("badge-dot");
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("size-1.5");
    expect(dot).toHaveClass("rounded-full");
    expect(dot).toHaveClass("bg-current");
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });

  it("adds animate-celo-pulse class and data-pulse attr when pulse=true", () => {
    render(
      <BadgeV4 variant="forest" dot pulse>
        Live
      </BadgeV4>,
    );
    const dot = screen.getByTestId("badge-dot");
    expect(dot).toHaveClass("animate-celo-pulse");
    expect(dot).toHaveAttribute("data-pulse", "true");
  });

  it("does not render the dot when prop is omitted", () => {
    render(<BadgeV4>Plain</BadgeV4>);
    expect(screen.queryByTestId("badge-dot")).not.toBeInTheDocument();
  });

  it("forwards ref to the underlying span element", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<BadgeV4 ref={ref}>x</BadgeV4>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});
