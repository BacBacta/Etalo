// Shared card-elevation token for the seller dashboard surfaces.
//
// A pronounced-but-clean floating-card shadow in light mode (Stripe /
// Linear at-rest cards) that clearly lifts cards off the page, plus a
// real shadow + hairline ring in dark mode where a flat surface reads
// muddy. Palette unchanged — depth only.
//
// One token so every tab (Overview / Products / Profile) shares the
// exact same elevation; tune the intensity here and it propagates
// everywhere at once.
export const ELEVATION =
  "shadow-[0_1px_3px_rgba(16,24,40,0.10),0_10px_28px_-6px_rgba(16,24,40,0.16)] dark:shadow-[0_6px_20px_-4px_rgba(0,0,0,0.55)] dark:ring-1 dark:ring-white/[8%]";
