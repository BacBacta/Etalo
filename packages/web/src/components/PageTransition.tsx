"use client";

import { AnimatePresence, m } from "motion/react";
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
const variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const transition = {
  duration: 0.3,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={pathname}
        data-pathname={pathname}
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
