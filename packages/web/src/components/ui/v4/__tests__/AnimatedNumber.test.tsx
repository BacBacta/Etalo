/**
 * Vitest specs for AnimatedNumber (J10-V5 Phase 2 Block 8 refactored v2).
 *
 * Coverage:
 * - initial render shows the formatted value (decimals + suffix) +
 *   tabular nums inline style applied. useState(value) initializes at
 *   value, useEffect early-returns (fromValue === value), so no
 *   0-flash and no rAF loop on mount.
 * - prefers-reduced-motion: matchMedia stub matches=true → on prop
 *   change useEffect takes the instant-set branch (setCurrentValue
 *   directly, no rAF), so the new value lands on the next render.
 *   Verified via waitFor (single React commit cycle).
 *
 * No motion runtime → no MotionGlobalConfig.skipAnimations dependency,
 * no per-file mock of motion/react. Custom rAF tween is testable
 * directly via state assertions.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnimatedNumber } from "@/components/ui/v4/AnimatedNumber";

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
    // Tabular nums via Tailwind class keeps digit width fixed during
    // the tween — no layout shift. Phase 5 Block 1 sub-block 1.1
    // converted from inline `style` to className. jsdom does NOT
    // resolve className-derived computed styles, so toHaveStyle no
    // longer works here ; toHaveClass catches the same intent at the
    // class boundary.
    expect(node).toHaveClass("tabular-nums");
  });

  it("instant-sets the value when prefers-reduced-motion: reduce matches (a11y)", async () => {
    stubMatchMedia(true);
    const { rerender } = render(
      <AnimatedNumber
        value={10}
        decimals={0}
        suffix=" credits"
        data-testid="amount"
      />,
    );
    expect(screen.getByTestId("amount")).toHaveTextContent("10 credits");
    rerender(
      <AnimatedNumber
        value={25}
        decimals={0}
        suffix=" credits"
        data-testid="amount"
      />,
    );
    // Under reduced-motion the effect calls setCurrentValue(value) on
    // the same effect tick — no rAF, no easing — so the next React
    // commit shows the new value.
    await waitFor(() =>
      expect(screen.getByTestId("amount")).toHaveTextContent("25 credits"),
    );
  });
});
