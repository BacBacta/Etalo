/**
 * V4 component-library local `cn` utility (J9 Block 3).
 *
 * Extends `tailwind-merge` so it recognises the custom V4 design-system
 * tokens declared in `tailwind.config.ts`. Without this, `twMerge`
 * groups custom font-size classes (`text-body`, `text-display-1`, …)
 * with built-in text-color classes (`text-celo-forest`, …) under the
 * same `text-*` prefix and dedupes them incorrectly.
 *
 * Scope: V4 components only. Legacy `@/lib/utils` `cn` stays untouched.
 */
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const v4TwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-1",
            "display-2",
            "display-3",
            "display-4",
            "body-lg",
            "body",
            "body-sm",
            "label",
            "caption",
            "overline",
          ],
        },
      ],
      shadow: [
        { shadow: ["celo-sm", "celo-md", "celo-lg", "celo-hero"] },
      ],
      rounded: [{ rounded: ["pill"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return v4TwMerge(clsx(inputs));
}
