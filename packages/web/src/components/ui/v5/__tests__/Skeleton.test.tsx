/**
 * Vitest specs for SkeletonV5 (J10-V5 Phase 3 Block 3a).
 *
 * Coverage: 6 variants render, a11y attributes role/aria-busy/aria-label,
 * shimmer pseudo-class hooks, custom size prop on circle/row, className
 * pass-through.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkeletonV5 } from "@/components/ui/v5/Skeleton";

describe("SkeletonV5", () => {
  it("renders all 6 variants with shimmer base classes", () => {
    const variants = ["text", "text-multi", "circle", "rectangle", "card", "row"] as const;
    for (const variant of variants) {
      const { unmount, container } = render(
        <SkeletonV5 variant={variant} data-testid={`skel-${variant}`} />,
      );
      const el = screen.getByTestId(`skel-${variant}`);
      expect(el).toBeInTheDocument();
      // text-multi and row are wrapper variants — shimmer lives on inner
      // children rather than the outer element itself.
      const shimmerHost =
        variant === "text-multi" || variant === "row"
          ? container.querySelector("[aria-hidden='true']")
          : el;
      expect(shimmerHost).not.toBeNull();
      expect(shimmerHost!.className).toMatch(/before:animate-shimmer/);
      expect(shimmerHost!.className).toMatch(/before:-translate-x-full/);
      unmount();
    }
  });

  it("exposes role=status, aria-busy=true, aria-label=Loading", () => {
    render(<SkeletonV5 variant="card" data-testid="skel-a11y" />);
    const el = screen.getByTestId("skel-a11y");
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveAttribute("aria-busy", "true");
    expect(el).toHaveAttribute("aria-label", "Loading");
  });

  it("applies custom size prop to circle variant via inline style", () => {
    render(<SkeletonV5 variant="circle" size={64} data-testid="skel-circle" />);
    const el = screen.getByTestId("skel-circle");
    expect(el).toHaveStyle({ width: "64px", height: "64px" });
    expect(el.className).toMatch(/rounded-full/);
  });

  it("merges caller className while preserving variant base classes", () => {
    render(
      <SkeletonV5
        variant="rectangle"
        className="aspect-square max-w-md"
        data-testid="skel-rect"
      />,
    );
    const el = screen.getByTestId("skel-rect");
    expect(el.className).toMatch(/aspect-square/);
    expect(el.className).toMatch(/max-w-md/);
    expect(el.className).toMatch(/rounded-md/);
  });

  it("text-multi variant renders 3 rows with last row narrower (w-3/4)", () => {
    const { container } = render(
      <SkeletonV5 variant="text-multi" data-testid="skel-multi" />,
    );
    const rows = container.querySelectorAll("span[aria-hidden='true']");
    expect(rows).toHaveLength(3);
    expect(rows[2].className).toMatch(/w-3\/4/);
  });
});
