/**
 * Vitest specs for AnimatedNumber (J10-V5 Phase 2 Block 8).
 *
 * Coverage:
 * - initial render shows the formatted value (decimals + suffix)
 *   without flashing through 0 → value (first-render guard) + tabular
 *   nums inline style applied
 * - prefers-reduced-motion bypasses the animate() dispatch (a11y
 *   contract). We spy on motion's animate via per-file mock so the
 *   assertion is on the dispatch decision, not on jsdom's RAF tick
 *   behavior — m.span's textContent commit goes through motion's
 *   frame loop which doesn't run reliably under jsdom even with
 *   skipAnimations.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>(
    "motion/react",
  );
  return {
    ...actual,
    animate: vi.fn(actual.animate),
  };
});

import { animate } from "motion/react";

import { AnimatedNumber } from "@/components/ui/v4/AnimatedNumber";

const animateSpy = animate as unknown as ReturnType<typeof vi.fn>;

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe("AnimatedNumber", () => {
  beforeEach(() => {
    animateSpy.mockClear();
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the initial value formatted with decimals + suffix (no 0-flash)", () => {
    render(
      <AnimatedNumber
        value={1.5}
        decimals={2}
        suffix=" USDT"
        data-testid="amount"
      />,
    );
    const node = screen.getByTestId("amount");
    expect(node).toHaveTextContent("1.50 USDT");
    // Tabular nums applied inline so digit width stays fixed during
    // tween — Phase 5 will standardize via Tailwind utility.
    expect(node).toHaveStyle({ fontVariantNumeric: "tabular-nums" });
    // First render must NOT call animate() — that's the no-flash
    // contract. Only subsequent prop changes trigger a tween.
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it("noops the tween when prefers-reduced-motion: reduce matches (a11y contract)", () => {
    stubMatchMedia(true);
    const { rerender } = render(
      <AnimatedNumber value={10} decimals={0} suffix=" credits" data-testid="amount" />,
    );
    rerender(
      <AnimatedNumber value={25} decimals={0} suffix=" credits" data-testid="amount" />,
    );
    expect(animateSpy).not.toHaveBeenCalled();
  });
});
