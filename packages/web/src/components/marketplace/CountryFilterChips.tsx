/**
 * CountryFilterChips — Sprint J11.7 Block 9 (ADR-045).
 *
 * Pill-style filter for the V1 markets (Nigeria / Ghana / Kenya / All
 * countries). Mirrors the country code values from CountrySelector
 * (Block 4) ; pure-display labels via lib/country.ts countryName().
 *
 * a11y :
 * - role=radiogroup with aria-checked on each pill
 * - keyboard nav out-of-the-box via tab + space
 * - 44 x 44 minimum touch targets (CLAUDE.md design standards)
 */
"use client";

import { COUNTRY_OPTIONS, type CountryCode } from "@/components/CountrySelector";
import { countryName } from "@/lib/country";
import { cn } from "@/lib/utils";

export type CountryFilterValue = CountryCode | "all";

const ALL_LABEL = "All countries";

// Country flag emoji prefixes for the premium marketplace UX —
// gives the chip row a visual rhythm (🇳🇬 🇬🇭 🇰🇪) so buyers spot
// their market at a glance instead of reading 3 country names.
const COUNTRY_FLAGS: Record<CountryCode, string> = {
  NGA: "🇳🇬",
  GHA: "🇬🇭",
  KEN: "🇰🇪",
};

interface Props {
  value: CountryFilterValue;
  onChange: (value: CountryFilterValue) => void;
  className?: string;
  /** Disable interaction while a refetch is in flight. */
  disabled?: boolean;
}

export function CountryFilterChips({
  value,
  onChange,
  className,
  disabled,
}: Props) {
  const options: Array<{
    key: CountryFilterValue;
    label: string;
    flag?: string;
  }> = [
    { key: "all", label: ALL_LABEL },
    ...COUNTRY_OPTIONS.map((c) => ({
      key: c as CountryFilterValue,
      label: countryName(c) ?? c,
      flag: COUNTRY_FLAGS[c],
    })),
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Filter by country"
      data-testid="country-filter-chips"
      // Horizontal scroll instead of `flex-wrap` so the chips never
      // claim a second row of vertical space — critical on the 360 px
      // MiniPay viewport where 4 chips wrapped to 2 lines were eating
      // ~120 px above the fold. `-mx-4 px-4` lets the row bleed to the
      // edges of the page padding so chips can scroll past the visual
      // boundary like a native carousel. `[&::-webkit-scrollbar]:hidden`
      // hides the scrollbar inline ; mobile webkit doesn't render one
      // anyway, this only affects desktop preview.
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {options.map((opt) => {
        const checked = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={checked ? "true" : "false"}
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            data-testid={`country-chip-${opt.key}`}
            className={cn(
              // `flex-shrink-0` + `whitespace-nowrap` lock each chip's
              // width to its content so the row stays single-line and
              // overflows horizontally instead of wrapping.
              "inline-flex flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
              "min-h-[44px] px-4 py-2",
              "rounded-full border text-sm font-medium",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              checked
                ? "border-celo-dark bg-celo-dark text-celo-light shadow-sm hover:bg-celo-dark/90 dark:border-celo-light dark:bg-celo-light dark:text-celo-dark dark:hover:bg-celo-light/90"
                : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50 dark:border-celo-light/15 dark:bg-celo-dark-elevated dark:text-celo-light/85 dark:hover:bg-celo-dark-bg",
            )}
          >
            {opt.flag ? (
              <span aria-hidden className="text-base leading-none">
                {opt.flag}
              </span>
            ) : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
