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
  DotsThreeCircle,
  ForkKnife,
  House,
  Sparkle,
  SquaresFour,
  TShirt,
  type Icon,
} from "@phosphor-icons/react";

import {
  CATEGORY_OPTIONS,
  categoryLabel,
  type CategoryCode,
} from "@/lib/categories";
import { cn } from "@/lib/utils";

export type CategoryFilterValue = CategoryCode | "all";

const ALL_LABEL = "All categories";

// Category icons — Phosphor weight=regular outline. Vector glyphs
// that hold up crisp across DPRs and follow currentColor for the
// chip active/inactive inversion. Replaces the previous Tabler
// iteration : Tabler shipped 6 icons in this single file and was
// the only consumer of @tabler/icons-react ; consolidating on
// Phosphor (already pinned and used in 30+ other components)
// drops the redundant dep and saves the bundle slot.
const CATEGORY_ICON: Record<CategoryFilterValue, Icon> = {
  all: SquaresFour,
  fashion: TShirt,
  beauty: Sparkle,
  food: ForkKnife,
  home: House,
  other: DotsThreeCircle,
};

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
  const options: Array<{
    key: CategoryFilterValue;
    label: string;
    icon: Icon;
  }> = [
    { key: "all", label: ALL_LABEL, icon: CATEGORY_ICON.all },
    ...CATEGORY_OPTIONS.map((c) => ({
      key: c as CategoryFilterValue,
      label: categoryLabel(c) ?? c,
      icon: CATEGORY_ICON[c],
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
              "inline-flex flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
              "min-h-[44px] px-4 py-2",
              "rounded-full border text-sm font-medium",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              checked
                ? "border-celo-forest bg-celo-forest text-celo-light shadow-celo-sm hover:bg-celo-forest-dark dark:border-celo-forest-bright dark:bg-celo-forest-bright dark:text-celo-light dark:hover:bg-celo-forest"
                : "border-celo-sand/80 bg-celo-light text-celo-dark/80 shadow-celo-sm hover:border-celo-forest/30 hover:bg-celo-sand/40 hover:text-celo-dark dark:border-celo-light/10 dark:bg-celo-dark-surface dark:text-celo-light/70 dark:hover:border-celo-forest-bright/30 dark:hover:bg-celo-dark-elevated dark:hover:text-celo-light",
            )}
          >
            <opt.icon
              aria-hidden
              weight="regular"
              className="h-[18px] w-[18px] flex-shrink-0"
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
