/**
 * Approximate USDT → local currency conversion for the V1 intra-Africa
 * markets (ADR-041 — NGA / GHA / KEN / ZAF). Hardcoded rates ; refresh
 * cadence is V1.5+ (live forex via Chainlink or an external API).
 *
 * The values are intentionally rounded so the buyer reads them as a
 * mental anchor, not an exchange-grade quote — the actual payment is
 * always in USDT. Surfacing local currency reduces the cognitive load
 * of "what does 25 USDT actually mean" without committing the platform
 * to a real FX quote.
 *
 * Rates pinned 2026-05-29. Off by 5 % is fine for the anchor use case
 * ; we add a "~" prefix in the UI so the buyer reads it as an
 * estimate.
 */

interface LocalCurrencyInfo {
  symbol: string;
  rate: number; // 1 USDT ≈ X local
  /** Decimals to round to in the display, balancing precision and
   *  readability. KES / NGN swing wide enough that 2 decimals add
   *  noise — round to whole local units. */
  decimals: number;
}

const LOCAL_BY_COUNTRY: Record<string, LocalCurrencyInfo> = {
  NGA: { symbol: "₦", rate: 1_540, decimals: 0 },
  GHA: { symbol: "GH₵", rate: 12.8, decimals: 1 },
  KEN: { symbol: "KSh", rate: 129, decimals: 0 },
  ZAF: { symbol: "R", rate: 18.2, decimals: 1 },
};

/**
 * Format a USDT decimal-string as an approximate local-currency hint
 * (e.g. "~₦38 500"). Returns null when the country is unknown or the
 * amount is unparseable, so the caller can hide the hint chip without
 * a layout shift.
 */
export function formatLocalCurrencyHint(
  usdtAmount: string | number,
  country: string | null | undefined,
): string | null {
  if (!country) return null;
  const info = LOCAL_BY_COUNTRY[country];
  if (!info) return null;

  const numeric =
    typeof usdtAmount === "string" ? Number(usdtAmount) : usdtAmount;
  if (!Number.isFinite(numeric) || numeric < 0) return null;

  const localAmount = numeric * info.rate;
  // Manual grouping with a regular ASCII space — reads as "38 500"
  // and matches the African informal-ecom convention. Sidesteps Intl's
  // locale-dependent NBSP separator which varies by Node ICU version,
  // breaks snapshot tests, and can render as ?? on some Android builds.
  const fixed = localAmount.toFixed(info.decimals);
  const [intPart, decPart] = fixed.split(".");
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const grouped = decPart ? `${groupedInt}.${decPart}` : groupedInt;
  return `~${info.symbol}${grouped}`;
}
