"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// J10-V5 Phase 2 Block 4 — page transitions Next.js App Router. Wraps
// the route content (NOT the header, NOT the toaster) with an
// AnimatePresence keyed on pathname so navigation triggers fade-slide.
//
// `initial={false}` on AnimatePresence skips the enter animation on
// first hydration (no flash on reload); subsequent route changes get
// the full sequence. `mode="wait"` sequences exit-then-enter so
// layouts don't overlap during transition. If lag becomes perceptible
// on heavy routes (e.g. /seller/dashboard), Phase 5 polish can switch
// to `mode="popLayout"` — that requires upgrading LazyMotion features
// from `domAnimation` to `domMax`.
//
// Variants: forward-motion paradigm (slide up entry + slide up exit
// = "moving forward through pages") with the V5-spec'd ease curve
// `cubic-bezier(0.16, 1, 0.3, 1)` and 300ms duration.
//
// Edge cases handled by design:
// - Modals/Dialogs render in document.body portals → outside this
//   subtree, no conflict with parent AnimatePresence
// - searchParams changes don't change pathname → no re-mount, no
//   transition (correct — search filtering shouldn't swap the page)
// - Next.js scroll restoration runs at navigation time, untouched
// - error.tsx / not-found.tsx render in the same {children} slot →
//   transition into the error UI naturally
//
// J10-V5 Phase 5 polish residual Item 4 — useReducedMotion gates the
// fade-slide y:8 translate. When the user prefers reduced motion, only
// an opacity fade plays (150ms easeOut tween, no translation). The
// 8px translate is mild but vestibular disorders can still flag any
// translation as a trigger. WCAG 2.1 SC 2.3.3 — Animation from
// Interactions. Mirrors the DialogV4 / SheetV4 / ButtonV4 pattern.
const standardVariants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const reducedVariants = {
  initial: { opacity: 0 },
  enter: { opacity: 1 },
  exit: { opacity: 0 },
};

const standardTransition = {
  duration: 0.3,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

const reducedTransition = {
  duration: 0.15,
  ease: "easeOut" as const,
};

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const variants = shouldReduceMotion ? reducedVariants : standardVariants;
  const transition = shouldReduceMotion
    ? reducedTransition
    : standardTransition;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={pathname}
        data-pathname={pathname}
        data-reduced-motion={shouldReduceMotion ? "true" : undefined}
        initial="initial"
        animate="enter"
        exit="exit"
        variants={variants}
        transition={transition}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
