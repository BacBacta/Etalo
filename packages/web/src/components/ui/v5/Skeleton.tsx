/**
 * SkeletonV5 — first V5 component (J10-V5 Phase 3 Block 3a).
 *
 * Robinhood-style shimmer skeleton screens, replaces V4 `celo-pulse`
 * spinners/plain-text loaders on data-fetch surfaces. See
 * docs/DESIGN_V5_PREVIEW.md §Skeleton screens systematic V5.
 *
 * Variants:
 *   - text          single-line label placeholder (h-4 w-full)
 *   - text-multi    3 stacked text rows, last row narrower (w-3/4)
 *   - circle        avatar/icon placeholder (size prop drives w/h)
 *   - rectangle     image/banner placeholder (caller sizes via className)
 *   - card          full block placeholder (h-40 rounded-lg)
 *   - row           list-item placeholder (circle + text-multi side-by-side)
 *
 * The shimmer is a `before:` pseudo-element that sweeps a translucent
 * gradient left→right via the Tailwind `animate-shimmer` keyframe
 * (1.5s linear infinite — see tailwind.config.ts). Reuses the V4 `cn`
 * utility since SkeletonV5 introduces no new design tokens that would
 * conflict with twMerge groupings.
 */
import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/components/ui/v4/utils";

type SkeletonV5Variant =
  | "text"
  | "text-multi"
  | "circle"
  | "rectangle"
  | "card"
  | "row";

export interface SkeletonV5Props extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonV5Variant;
  /** Pixel size for `circle` variant (width = height). Defaults to 40. */
  size?: number;
}

const baseShimmer = [
  "relative overflow-hidden",
  "bg-neutral-200/60 dark:bg-celo-dark-surface/60",
  // The shimmer gradient sweep — pseudo-element absolutely positioned so
  // the underlying skeleton shape (rounded radius, dimensions) is
  // preserved while the highlight band animates over the top.
  "before:absolute before:inset-0",
  "before:-translate-x-full",
  "before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent",
  "dark:before:via-white/10",
  "before:animate-shimmer",
].join(" ");

const variantClasses: Record<Exclude<SkeletonV5Variant, "text-multi" | "row">, string> = {
  text: "h-4 w-full rounded-sm",
  circle: "rounded-full",
  rectangle: "w-full h-32 rounded-md",
  card: "w-full h-40 rounded-lg",
};

export const SkeletonV5 = forwardRef<HTMLDivElement, SkeletonV5Props>(
  ({ className, variant = "text", size = 40, style, ...props }, ref) => {
    const a11y = {
      role: "status",
      "aria-busy": true,
      "aria-label": "Loading",
    } as const;

    if (variant === "text-multi") {
      return (
        <div
          ref={ref}
          className={cn("flex flex-col gap-2", className)}
          {...a11y}
          {...props}
        >
          <span className={cn(baseShimmer, variantClasses.text)} aria-hidden="true" />
          <span className={cn(baseShimmer, variantClasses.text)} aria-hidden="true" />
          <span
            className={cn(baseShimmer, variantClasses.text, "w-3/4")}
            aria-hidden="true"
          />
        </div>
      );
    }

    if (variant === "row") {
      return (
        <div
          ref={ref}
          className={cn("flex items-center gap-3", className)}
          {...a11y}
          {...props}
        >
          <span
            aria-hidden="true"
            style={{ width: size, height: size }}
            className={cn(baseShimmer, variantClasses.circle, "shrink-0")}
          />
          <div className="flex-1 flex flex-col gap-2">
            <span
              className={cn(baseShimmer, variantClasses.text, "w-1/2")}
              aria-hidden="true"
            />
            <span
              className={cn(baseShimmer, variantClasses.text, "w-3/4")}
              aria-hidden="true"
            />
          </div>
        </div>
      );
    }

    const inlineStyle =
      variant === "circle"
        ? { width: size, height: size, ...style }
        : style;

    return (
      <div
        ref={ref}
        className={cn(baseShimmer, variantClasses[variant], className)}
        style={inlineStyle}
        {...a11y}
        {...props}
      />
    );
  },
);
SkeletonV5.displayName = "SkeletonV5";
