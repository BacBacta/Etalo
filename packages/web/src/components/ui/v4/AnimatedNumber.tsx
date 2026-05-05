"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/v4/utils";

// J10-V5 Phase 2 Block 8 (refactored bundle fix v2) — premium counter
// for USDT amounts + credit balances. Custom rAF tween + easeOutCubic,
// no motion runtime dependency. Replaces the useSpring variant (refactor
// v1) which still pulled spring physics from the motion/react main
// bundle and kept /seller/dashboard 2 KB above the 280 KB First Load
// trigger. Net cost: ~30 lines, zero new bundle deps.
//
// Behaviors:
// - First render: useState(value) sets initial state to value, useEffect
//   takes the early-return path (fromValue === value). No animation,
//   no 0 → value flash.
// - Prop change: useEffect captures the latest displayed value (via
//   currentValueRef so the read isn't a stale-closure hazard) as
//   fromValue, schedules rAF loop that interpolates fromValue → value
//   over `duration` seconds with easeOutCubic. Cleans up via
//   cancelAnimationFrame on dep change / unmount.
// - prefers-reduced-motion: instant setCurrentValue(value), no tween.
//   matchMedia is read fresh on each value change so a user toggling
//   the OS pref mid-session sees the new behavior on the next update.
// - Tabular nums via Tailwind class `tabular-nums` (compiles to
//   font-variant-numeric: tabular-nums) so digit width stays fixed
//   during the tween — no layout shift. Phase 5 Block 1 sub-block 1.1
//   converted from inline `style` to className for systematic
//   consistency across the design system; caller-supplied className
//   passed through `cn()` so additional utilities (text-xl, etc.)
//   compose cleanly.
// - easeOutCubic = 1 - (1-t)^3 — visually similar to V5's
//   cubic-bezier(0.16, 1, 0.3, 1) used elsewhere (Block 4 PageTransition,
//   Block 6 Overlay), without the motion runtime.

interface AnimatedNumberProps {
  value: number;
  /** Decimals shown via toFixed. 0 for credit counts, 2 for USDT. */
  decimals?: number;
  /** Tween duration in seconds. Defaults to 0.4 (V5 200-400ms range). */
  duration?: number;
  /** Optional suffix concatenated to the formatted number, e.g. " USDT". */
  suffix?: string;
  className?: string;
  "data-testid"?: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 0.4,
  suffix = "",
  className,
  "data-testid": dataTestId,
}: AnimatedNumberProps) {
  const [currentValue, setCurrentValue] = useState(value);
  // Track the latest displayed value without making it a useEffect dep
  // (which would re-trigger the effect on every tick → infinite loop).
  const currentValueRef = useRef(value);
  currentValueRef.current = currentValue;

  useEffect(() => {
    const fromValue = currentValueRef.current;
    if (fromValue === value) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setCurrentValue(value);
      return;
    }

    const startTime = performance.now();
    const durationMs = duration * 1000;
    let frameId = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      setCurrentValue(fromValue + (value - fromValue) * eased);
      if (t < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value, duration]);

  return (
    <span
      className={cn("tabular-nums", className)}
      data-testid={dataTestId}
    >
      {currentValue.toFixed(decimals) + suffix}
    </span>
  );
}
