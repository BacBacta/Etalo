"use client";

import { LazyMotion, domAnimation } from "motion/react";
import type { ReactNode } from "react";

// J10-V5 Phase 2 Block 1 — wraps the app in motion's LazyMotion shell
// so client components can use `m.div` etc. with only ~12-18 KB of
// runtime bundled (vs ~35-45 KB for the full `motion.div` import path).
// Future Phase 2 blocks introduce real animations via `m.*` components.
//
// To opt into drag/layout features on a specific surface, swap
// `domAnimation` for `domMax` lazily at that point.
//
// `strict` mode flags any `motion.div` usage at runtime so we catch
// accidental full-runtime imports (which would silently bloat the
// bundle). Only `m.div` etc. are valid under LazyMotion strict.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
