/**
 * Product categories — V1 marketplace minimal 5-value enum.
 *
 * Mirrors backend `app.models.enums.ProductCategory`. Adding a new
 * category requires :
 * 1. Append the enum value in `enums.py`
 * 2. Append a matching entry in `CATEGORY_OPTIONS` below
 * 3. (No DB migration — the column is `String(50)`, validation lives
 *    at the Pydantic / TypeScript layer.)
 *
 * Display labels are hardcoded English V1. Multi-language returns
 * V1.5+ tied to `seller.country` auto-detection (same scope as the
 * caption-language drop on MarketingTab).
 */
export const CATEGORY_OPTIONS = [
  "fashion",
  "beauty",
  "food",
  "home",
  "other",
] as const;

export type CategoryCode = (typeof CATEGORY_OPTIONS)[number];

export function isValidCategoryCode(value: unknown): value is CategoryCode {
  return (
    typeof value === "string" &&
    (CATEGORY_OPTIONS as readonly string[]).includes(value)
  );
}

const LABELS: Record<CategoryCode, string> = {
  fashion: "Fashion",
  beauty: "Beauty",
  food: "Food",
  home: "Home",
  other: "Other",
};

export function categoryLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  if (isValidCategoryCode(code)) return LABELS[code];
  // Stale value from before the enum was locked — fall back to the
  // raw string title-cased so the UI never renders an empty cell.
  return code.charAt(0).toUpperCase() + code.slice(1);
}
