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
  const options: Array<{ key: CountryFilterValue; label: string }> = [
    { key: "all", label: ALL_LABEL },
    ...COUNTRY_OPTIONS.map((c) => ({
      key: c as CountryFilterValue,
      label: countryName(c) ?? c,
    })),
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Filter by country"
      data-testid="country-filter-chips"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((opt) => {
        const checked = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            data-testid={`country-chip-${opt.key}`}
            className={cn(
              "inline-flex items-center justify-center",
              "min-h-[44px] px-4 py-2",
              "rounded-full text-sm font-medium",
              "transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              checked
                ? "bg-celo-forest text-celo-light hover:bg-celo-forest/90"
                : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
