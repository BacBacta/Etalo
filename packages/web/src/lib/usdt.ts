import { formatUnits, parseUnits } from "viem";

/**
 * USDT has 6 decimals — never use parseEther / formatEther for it.
 */
export const USDT_DECIMALS = 6;

// === Web3 primitives ===

/** Parse a human-readable USDT string (e.g. "12.50") into raw bigint units. */
export function parseUsdt(amount: string): bigint {
  return parseUnits(amount, USDT_DECIMALS);
}

/** Format a raw bigint USDT amount into a human-readable string (no suffix). */
export function formatUsdt(amount: bigint): string {
  return formatUnits(amount, USDT_DECIMALS);
}

// === Display helpers (locale-pinned "en-US", " USDT" suffix) ===
//
// J10-V5 Phase 5 polish residual Item 1 — three explicit named variants
// replace the ambiguous `displayUsdt` that previously had two divergent
// signatures (bigint in lib/usdt.ts vs Decimal-string in lib/api.ts) and
// a third local helper `displayUsdtNumber` in OverviewTab.tsx. Locale
// pin "en-US" follows Phase 5 Block 1 sub-block 1.5 systematic sweep
// (decimal "." + thousands "," regardless of system locale, V1 markets
// NG/GH/KE/ZA all default English on MiniPay).

/**
 * Format a raw bigint USDT amount (6-decimal storage) into a display
 * string with two decimals and a "USDT" suffix, e.g. `12_345_678n` →
 * "12.35 USDT". Used by SSR consumers (server components / opengraph
 * images) that hold raw bigint values.
 */
export function displayUsdtFromBigint(amount: bigint): string {
  const raw = formatUsdt(amount);
  const value = Number(raw);
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDT`;
}

/**
 * Format a Decimal string USDT amount (e.g. backend payload field) into
 * a display string with two decimals and a "USDT" suffix. Falls back to
 * the raw string + suffix when the value is not a parseable number.
 * Used by API response display where the backend serialises Decimal as
 * a string.
 */
export function displayUsdtFromDecimalString(amount: string): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return `${amount} USDT`;
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDT`;
}

/**
 * Format a human-scale number USDT amount (already divided into a
 * non-raw value, e.g. 12.5 not 12_500_000) into a display string with
 * two decimals and a "USDT" suffix. Used by frontend computed values
 * (analytics summary, KPI tiles) where the backend Decimal has already
 * been parseFloat'd into a JS Number.
 */
export function displayUsdtFromHumanNumber(amount: number): string {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDT`;
}

/**
 * Convert a raw 6-decimal USDT amount stored as a JavaScript number
 * (e.g. 12_990_000) into a 2-decimal display string WITHOUT the USDT
 * suffix, e.g. "12.99". Locale-agnostic toFixed(2) — appropriate for
 * layout-aligned table columns where the consumer composes the suffix
 * separately. JS Number safe up to 9_007 USD given V1 caps
 * (MAX_ORDER = 500 USDT).
 */
export function formatRawUsdt(rawAmount: number): string {
  return (rawAmount / 1_000_000).toFixed(2);
}
