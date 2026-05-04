/**
 * Vitest specs for PageTransition (J10-V5 Phase 2 Block 4).
 *
 * JSDom can't execute motion, so we test the structural contract:
 * - children render inside the motion wrapper
 * - data-pathname attribute mirrors usePathname() so the AnimatePresence
 *   key regression-guards the navigation re-mount logic
 */
import { render, screen } from "@testing-library/react";
import { useReducedMotion } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketplace",
}));

// J10-V5 Phase 5 polish residual Item 4 — useReducedMotion mocked at
// the module boundary (mirror Dialog/Sheet test pattern). Default
// mock returns false so existing structural specs continue exercising
// the standard motion variants path.
vi.mock("motion/react", async () => {
  const actual =
    await vi.importActual<typeof import("motion/react")>("motion/react");
  return {
    ...actual,
    useReducedMotion: vi.fn(),
  };
});

const useReducedMotionMock = vi.mocked(useReducedMotion);

beforeEach(() => {
  useReducedMotionMock.mockReturnValue(false);
});

afterEach(() => {
  useReducedMotionMock.mockReset();
});

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

  // J10-V5 Phase 5 polish residual Item 4 — prefers-reduced-motion
  // gating. JSDom can't observe motion's runtime variant resolution,
  // but the data-reduced-motion attribute encodes the branching
  // decision (translate y:8 fade-slide vs opacity-only fade) so the
  // suppression branch can be regression-guarded. WCAG 2.1 SC 2.3.3.
  describe("prefers-reduced-motion (Phase 5 polish residual Item 4)", () => {
    it("omits data-reduced-motion when the user has standard motion", () => {
      useReducedMotionMock.mockReturnValue(false);
      const { container } = render(
        <PageTransition>
          <span>x</span>
        </PageTransition>,
      );
      const wrapper = container.querySelector("[data-pathname]");
      expect(wrapper).not.toHaveAttribute("data-reduced-motion");
    });

    it("sets data-reduced-motion='true' when the user prefers reduced motion", () => {
      useReducedMotionMock.mockReturnValue(true);
      const { container } = render(
        <PageTransition>
          <span>x</span>
        </PageTransition>,
      );
      const wrapper = container.querySelector("[data-pathname]");
      expect(wrapper).toHaveAttribute("data-reduced-motion", "true");
    });
  });
});
