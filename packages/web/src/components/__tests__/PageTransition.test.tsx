/**
 * Vitest specs for PageTransition (J10-V5 Phase 2 Block 4).
 *
 * JSDom can't execute motion, so we test the structural contract:
 * - children render inside the motion wrapper
 * - data-pathname attribute mirrors usePathname() so the AnimatePresence
 *   key regression-guards the navigation re-mount logic
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketplace",
}));

import { PageTransition } from "@/components/PageTransition";

describe("PageTransition", () => {
  it("renders children inside the motion wrapper", () => {
    render(
      <PageTransition>
        <div data-testid="child">marketplace content</div>
      </PageTransition>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toHaveTextContent(
      "marketplace content",
    );
  });

  it("sets data-pathname mirroring usePathname() (AnimatePresence key regression-guard)", () => {
    const { container } = render(
      <PageTransition>
        <span>x</span>
      </PageTransition>,
    );
    const wrapper = container.querySelector("[data-pathname]");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveAttribute("data-pathname", "/marketplace");
  });
});
