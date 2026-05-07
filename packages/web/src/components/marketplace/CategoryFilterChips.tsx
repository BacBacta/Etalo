/**
 * CategoryFilterChips — marketplace UX pass + filters.
 *
 * Mirror of CountryFilterChips for the V1 ProductCategory enum
 * (fashion / beauty / food / home / other). Same horizontal scroll
 * pattern (1 line, no wrap), same a11y contract (radiogroup with
 * aria-checked), same dark mode tokens.
 *
 * Display labels come from `lib/categories.ts` (single source of truth
 * for category UX strings).
 */
"use client";

import {
  CATEGORY_OPTIONS,
  categoryLabel,
  type CategoryCode,
} from "@/lib/categories";
import { cn } from "@/lib/utils";

export type CategoryFilterValue = CategoryCode | "all";

const ALL_LABEL = "All categories";

interface Props {
  value: CategoryFilterValue;
  onChange: (value: CategoryFilterValue) => void;
  className?: string;
  /** Disable interaction while a refetch is in flight. */
  disabled?: boolean;
}

export function CategoryFilterChips({
  value,
  onChange,
  className,
  disabled,
}: Props) {
  const options: Array<{ key: CategoryFilterValue; label: string }> = [
    { key: "all", label: ALL_LABEL },
    ...CATEGORY_OPTIONS.map((c) => ({
      key: c as CategoryFilterValue,
      label: categoryLabel(c) ?? c,
    })),
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Filter by category"
      data-testid="category-filter-chips"
      // Same horizontal-scroll layout as CountryFilterChips so the two
      // rows stack consistently above the grid.
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
            data-testid={`category-chip-${opt.key}`}
            className={cn(
              "inline-flex flex-shrink-0 items-center justify-center whitespace-nowrap",
              "min-h-[44px] px-4 py-2",
              "rounded-full text-sm font-medium",
              "transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              checked
                ? "bg-celo-forest text-celo-light hover:bg-celo-forest/90"
                : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-celo-dark-elevated dark:text-celo-light dark:hover:bg-celo-dark-surface",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
