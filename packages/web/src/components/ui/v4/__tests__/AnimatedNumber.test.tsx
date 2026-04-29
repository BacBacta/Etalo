/**
 * Vitest specs for AnimatedNumber (J10-V5 Phase 2 Block 8 refactored).
 *
 * Coverage:
 * - initial render shows the formatted value (decimals + suffix) +
 *   tabular nums inline style applied. useSpring(value) initializes
 *   at value, so no 0-flash regardless of any imperative dispatch.
 * - prefers-reduced-motion swaps the spring config to a near-instant
 *   settle (a11y contract). We assert via per-file useSpring spy on
 *   the config argument — that's the dispatch decision motion makes,
 *   independent of jsdom's RAF tick behavior.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>(
    "motion/react",
  );
  return {
    ...actual,
    useSpring: vi.fn(actual.useSpring),
  };
});

import { useSpring } from "motion/react";

import { AnimatedNumber } from "@/components/ui/v4/AnimatedNumber";

const useSpringSpy = useSpring as unknown as ReturnType<typeof vi.fn>;

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
    useSpringSpy.mockClear();
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
    // the spring tween — Phase 5 will standardize via Tailwind utility.
    expect(node).toHaveStyle({ fontVariantNumeric: "tabular-nums" });
    // Normal V5 spring tuning when reduced-motion is off.
    const lastCallConfig =
      useSpringSpy.mock.calls[useSpringSpy.mock.calls.length - 1]?.[1];
    expect(lastCallConfig).toEqual({ stiffness: 100, damping: 30 });
  });

  it("swaps to a near-instant spring when prefers-reduced-motion: reduce matches (a11y)", () => {
    stubMatchMedia(true);
    render(
      <AnimatedNumber
        value={10}
        decimals={0}
        suffix=" credits"
        data-testid="amount"
      />,
    );
    const lastCallConfig =
      useSpringSpy.mock.calls[useSpringSpy.mock.calls.length - 1]?.[1];
    expect(lastCallConfig).toEqual({ stiffness: 10000, damping: 100 });
  });
});
