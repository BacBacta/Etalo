"use client";

import { useEffect, useRef } from "react";
import {
  animate,
  m,
  useMotionValue,
  useTransform,
} from "motion/react";

// J10-V5 Phase 2 Block 8 — premium counter for USDT amounts + credit
// balances. Pattern: useMotionValue holds the numeric state, animate()
// tweens it on prop change, useTransform formats it for display, and
// m.span subscribes textContent to the formatted MotionValue.
//
// Behaviors:
// - First render renders `value` without animating (avoids "0 → value"
//   flash on mount / SSR hydration).
// - prefers-reduced-motion: instant set, no animation.
// - Tabular nums inline (font-variant-numeric: tabular-nums) so digit
//   width stays fixed during the tween — no layout shift. Phase 5 will
//   standardize via Tailwind utility on every USDT amount surface.
// - 0.4s duration + V5 ease curve [0.16, 1, 0.3, 1] (cohérent Block 4
//   PageTransition + Block 6 Overlay).

interface AnimatedNumberProps {
  value: number;
  /** Decimals shown via toFixed. 0 for credit counts, 2 for USDT. */
  decimals?: number;
  /** Tween duration (seconds). Defaults to 0.4 (V5 200-400ms range). */
  duration?: number;
  /** Optional suffix concatenated to the formatted number, e.g. " USDT". */
  suffix?: string;
  className?: string;
  "data-testid"?: string;
}

export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 0.4,
  suffix = "",
  className,
  "data-testid": dataTestId,
}: AnimatedNumberProps) {
  const motionValue = useMotionValue(value);
  const formatted = useTransform(
    motionValue,
    (v) => v.toFixed(decimals) + suffix,
  );
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      motionValue.set(value);
      return;
    }
    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, duration, motionValue]);

  return (
    <m.span
      className={className}
      data-testid={dataTestId}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {formatted}
    </m.span>
  );
}
