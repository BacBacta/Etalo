// Shared visual rules for the / route hero CTAs. Hand-rolled to match
// ButtonV4 primary/secondary forest/pill/lg without importing ButtonV4
// itself (Lesson #80 — module-level motion in ButtonV4 would inject
// ~15-20 KB into / for nav buttons that don't need spring physics).
//
// Consumed by HomeMiniPay (MiniPay surface) + HomeLanding hero
// (web surface) + OpenBoutiqueCTA (web seller modal trigger).

const BASE = [
  "inline-flex items-center justify-center gap-2",
  "h-12 px-6 min-w-[200px]",
  "font-sans font-medium text-body-lg",
  "rounded-pill whitespace-nowrap",
  "transition-colors duration-200 ease-out",
  "outline-none",
].join(" ");

export const PRIMARY_CTA_CLASSES = [
  BASE,
  "bg-celo-forest text-celo-light hover:bg-celo-forest-dark",
  "dark:bg-celo-green dark:text-celo-dark dark:hover:bg-celo-green-hover",
  "focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 focus-visible:ring-offset-celo-light",
  "dark:focus-visible:ring-celo-forest-bright dark:focus-visible:ring-offset-celo-dark-bg",
].join(" ");

export const SECONDARY_CTA_CLASSES = [
  BASE,
  "border border-celo-forest bg-transparent text-celo-forest",
  "hover:bg-celo-forest-soft",
  "dark:border-celo-forest-bright dark:text-celo-forest-bright",
  "dark:hover:bg-celo-forest-bright-soft",
  "focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 focus-visible:ring-offset-celo-light",
  "dark:focus-visible:ring-celo-forest-bright dark:focus-visible:ring-offset-celo-dark-bg",
].join(" ");
