// J10-V5 Phase 2 Block 7 — celebration confetti for 5 milestone moments.
// Palette colors mirror tailwind.config.ts V5 tokens EXACTLY (no
// approximations) so on-page burst hues match every other surface
// without manual visual matching.
//
// A11y: respects prefers-reduced-motion (matchMedia query) — users who
// opt out of motion get no confetti, no toast-replacement substitute.
// SSR: noops outside the browser (typeof window guard) so RSC imports
// don't crash.
import confetti from "canvas-confetti";

export type MilestoneType =
  | "first-sale"
  | "withdrawal-complete"
  | "credit-purchase"
  | "image-generated"
  | "onboarding-complete";

// Exact V5 tokens from tailwind.config.ts — keep in sync if tokens
// move. Imported as inline literals (not from CSS vars) because
// canvas-confetti renders to a 2D canvas, not the CSS layer, so it
// can't read computed styles cheaply.
const FOREST = "#476520";
const FOREST_BRIGHT = "#5C8B2D";
const YELLOW = "#FBCC5C";
const LIGHT = "#FCFBF7";
const GREEN = "#00C853";

type ConfettiBurst = Parameters<typeof confetti>[0] & { delay?: number };

// Each milestone defines one or more bursts. Bursts with `delay > 0`
// fire on a setTimeout — used by withdrawal-complete to produce 3
// staggered waves (Robinhood-vibrant celebration).
const PRESETS: Record<MilestoneType, ConfettiBurst[]> = {
  "first-sale": [
    {
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: [FOREST, YELLOW],
    },
  ],
  "withdrawal-complete": [
    {
      particleCount: 100,
      spread: 60,
      origin: { y: 0.6 },
      colors: [GREEN, FOREST_BRIGHT],
    },
    {
      particleCount: 100,
      spread: 60,
      origin: { y: 0.6 },
      colors: [GREEN, FOREST_BRIGHT],
      delay: 200,
    },
    {
      particleCount: 100,
      spread: 60,
      origin: { y: 0.6 },
      colors: [GREEN, FOREST_BRIGHT],
      delay: 400,
    },
  ],
  "credit-purchase": [
    {
      particleCount: 50,
      spread: 50,
      ticks: 200,
      origin: { y: 0.6 },
      colors: [YELLOW, LIGHT],
    },
  ],
  "image-generated": [
    {
      particleCount: 30,
      spread: 45,
      scalar: 0.8,
      origin: { y: 0.6 },
      colors: [FOREST, LIGHT],
    },
  ],
  "onboarding-complete": [
    {
      particleCount: 200,
      spread: 90,
      origin: { y: 0.5 },
      colors: [FOREST, FOREST_BRIGHT, YELLOW, GREEN, LIGHT],
    },
  ],
};

export function fireMilestone(type: MilestoneType): void {
  if (typeof window === "undefined") return;
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }
  for (const burst of PRESETS[type]) {
    const { delay, ...options } = burst;
    if (delay && delay > 0) {
      setTimeout(() => {
        void confetti(options);
      }, delay);
    } else {
      void confetti(options);
    }
  }
}
