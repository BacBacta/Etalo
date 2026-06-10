"use client";

import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// Reusable entrance animation (fade + slight upward slide). Used to give
// the seller dashboard a sense of life — tab content slides in on every
// switch, and stacked sections cascade in with a small per-item delay
// instead of all snapping in at once.
//
// Uses `m.*` (not `motion.*`) so it stays inside the app's LazyMotion
// `domAnimation` budget (MotionProvider). Respects prefers-reduced-motion
// per WCAG 2.1 SC 2.3.3 — opacity-only fade, no translation, like
// PageTransition.
const EASE = [0.16, 1, 0.3, 1] as const;

interface AnimateInProps {
  children: ReactNode;
  /** Stagger offset in seconds when several siblings animate together. */
  delay?: number;
  /** Initial vertical offset in px (ignored under reduced motion). */
  y?: number;
  className?: string;
}

export function AnimateIn({
  children,
  delay = 0,
  y = 10,
  className,
}: AnimateInProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <m.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0.15 : 0.35,
        ease: reduce ? "easeOut" : EASE,
        delay: reduce ? 0 : delay,
      }}
    >
      {children}
    </m.div>
  );
}
