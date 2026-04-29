"use client";

import { useEffect, useState } from "react";
import { m, useSpring, useTransform } from "motion/react";

// J10-V5 Phase 2 Block 8 (refactored bundle fix) — premium counter
// for USDT amounts + credit balances. Pattern: useSpring drives the
// MotionValue, useTransform formats it for display, m.span subscribes
// textContent to the formatted MotionValue.
//
// Why useSpring (not animate() imperative) — animate() pulled in the
// tween/keyframes engine on top of LazyMotion's domAnimation features
// (~28 KB First Load growth on /seller/dashboard, breaking the 280 KB
// trigger budget). useSpring is part of the spring-physics path
// already shared with the LazyMotion chunk that Block 4-6 use, so the
// switch costs ~0 fresh bundle.
//
// Behaviors:
// - First render: useSpring(value) initializes the spring at value
//   (at rest). No animation, no 0 → value flash.
// - Prop change: useEffect fires spring.set(newValue) → spring tweens
//   to new target via physics.
// - prefers-reduced-motion: spring config switches to high
//   stiffness/damping so the spring settles in ~1 frame (effectively
//   instant). matchMedia is read once at mount — consistent with
//   Block 7's confetti util.
// - Tabular nums inline (font-variant-numeric: tabular-nums) so digit
//   width stays fixed during the tween — no layout shift. Phase 5 will
//   standardize via Tailwind utility on every USDT amount surface.

interface AnimatedNumberProps {
  value: number;
  /** Decimals shown via toFixed. 0 for credit counts, 2 for USDT. */
  decimals?: number;
  /** Optional suffix concatenated to the formatted number, e.g. " USDT". */
  suffix?: string;
  className?: string;
  "data-testid"?: string;
}

const SPRING_NORMAL = { stiffness: 100, damping: 30 };
const SPRING_REDUCED_MOTION = { stiffness: 10000, damping: 100 };

export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
  className,
  "data-testid": dataTestId,
}: AnimatedNumberProps) {
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const spring = useSpring(
    value,
    reducedMotion ? SPRING_REDUCED_MOTION : SPRING_NORMAL,
  );

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  const formatted = useTransform(
    spring,
    (v) => v.toFixed(decimals) + suffix,
  );

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
