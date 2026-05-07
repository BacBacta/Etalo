/**
 * SortDropdown — marketplace UX pass + filters.
 *
 * Sort selector for the marketplace listing. V1 surfaces 3 options
 * (newest / price asc / price desc) ; "popular" is a backend-only
 * fallback that mirrors newest until a denormalized score ships
 * V1.5+, so we don't surface it here to avoid implying a feature
 * that doesn't yet differentiate from the default.
 *
 * Native <select> for SR + keyboard + 44px touch target out of the
 * box. Display label rendered alongside via aria-labelledby pattern
 * established in MarketingTab caption-language section.
 */
"use client";

import { cn } from "@/lib/utils";

export type SortValue = "newest" | "price_asc" | "price_desc";

const OPTIONS: Array<{ value: SortValue; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low → high" },
  { value: "price_desc", label: "Price: high → low" },
];

interface Props {
  value: SortValue;
  onChange: (value: SortValue) => void;
  className?: string;
  disabled?: boolean;
}

export function SortDropdown({ value, onChange, className, disabled }: Props) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label
        htmlFor="marketplace-sort"
        className="shrink-0 text-sm text-celo-dark dark:text-celo-light"
      >
        Sort
      </label>
      <select
        id="marketplace-sort"
        data-testid="marketplace-sort"
        value={value}
        onChange={(e) => onChange(e.target.value as SortValue)}
        disabled={disabled}
        className={cn(
          "min-h-[44px] flex-1 rounded-md border p-2 text-sm",
          "bg-white text-celo-dark border-neutral-300",
          "dark:bg-celo-dark-elevated dark:text-celo-light dark:border-celo-light/20",
          "focus:border-celo-forest focus:outline-none focus:ring-2 focus:ring-celo-forest dark:focus:ring-celo-forest-bright",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
