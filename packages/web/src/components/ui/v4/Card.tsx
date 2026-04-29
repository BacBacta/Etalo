import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/ui/v4/utils";

const cardV4Variants = cva(
  [
    "rounded-3xl",
    "border",
    // J10-V5 Phase 4 Block 2 — transition includes `transform` so the
    // CSS hover lift on `interactive=true` is animated. Phase 2 Block 3
    // had excluded `transform` because motion drove it; Phase 4 Block 2
    // dropped the motion dep on CardV4 (Lesson #80 recidive — every
    // route consumer was paying ~15-60 KB of motion/react module cost
    // even when interactive=false), so CSS owns the transform now.
    "transition-[background-color,box-shadow,border-color,transform] duration-200 ease-out",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-celo-light text-celo-dark shadow-celo-md border-celo-dark/[8%] dark:bg-celo-dark-elevated dark:text-celo-light dark:border-celo-light/[8%]",
        elevated:
          "bg-celo-light text-celo-dark shadow-celo-lg border-celo-dark/[8%] dark:bg-celo-dark-elevated dark:text-celo-light dark:border-celo-light/[8%]",
        hero: "bg-celo-light text-celo-dark shadow-celo-hero border-celo-dark/[8%] dark:bg-celo-dark-elevated dark:text-celo-light dark:border-celo-light/[8%]",
        dark: "bg-celo-dark text-celo-light shadow-celo-lg border-celo-dark/[20%]",
      },
      padding: {
        default: "p-6",
        compact: "p-4",
        // J10-V5 Phase 4 Block 2 — `none` for cards whose children
        // manage their own internal spacing (e.g. ProductCard /
        // MarketplaceProductCard wrap a full-bleed aspect-square image
        // with text below; an outer p-4/p-6 would leave a white
        // border around the image).
        none: "",
      },
      interactive: {
        // J10-V5 Phase 4 Block 2 — pure CSS hover lift (vs Phase 2
        // Block 3 motion spring). 0.5 unit = 2px translate matching
        // the prior motion target. Shadow shift on hover provides the
        // "lift" affordance.
        true: "cursor-pointer hover:-translate-y-0.5 hover:shadow-celo-lg dark:hover:bg-celo-dark-surface",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "default",
      interactive: false,
    },
  },
);

export interface CardV4Props
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardV4Variants> {}

// J10-V5 Phase 4 Block 2 — motion/react import dropped. CardV4 is
// consumed cross-tree (ProductCard / MarketplaceProductCard rendered
// N times on /[handle] + /marketplace; StatCard / Recent orders /
// Stake tier on /seller/dashboard; HomeLanding feature cards on /).
// Motion at module scope was injecting +15-60 KB into each route's
// First Load JS even when interactive=false (Lesson #80 récidive).
// CSS hover:-translate-y-0.5 + transition-transform approximates the
// prior motion spring well enough at this 2px translate distance.
export const CardV4 = forwardRef<HTMLDivElement, CardV4Props>(
  (
    { className, variant, padding, interactive, ...props },
    ref,
  ) => (
    <div
      ref={ref}
      data-interactive={interactive || undefined}
      className={cn(
        cardV4Variants({ variant, padding, interactive }),
        className,
      )}
      {...props}
    />
  ),
);
CardV4.displayName = "CardV4";

export type CardHeaderV4Props = HTMLAttributes<HTMLDivElement>;

export const CardHeaderV4 = forwardRef<HTMLDivElement, CardHeaderV4Props>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1.5 mb-4", className)}
      {...props}
    />
  ),
);
CardHeaderV4.displayName = "CardHeaderV4";

export type CardTitleV4Props = HTMLAttributes<HTMLHeadingElement>;

export const CardTitleV4 = forwardRef<HTMLHeadingElement, CardTitleV4Props>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("font-display text-display-4", className)}
      {...props}
    />
  ),
);
CardTitleV4.displayName = "CardTitleV4";

export type CardDescriptionV4Props = HTMLAttributes<HTMLParagraphElement>;

export const CardDescriptionV4 = forwardRef<
  HTMLParagraphElement,
  CardDescriptionV4Props
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("font-sans text-body-sm opacity-60", className)}
    {...props}
  />
));
CardDescriptionV4.displayName = "CardDescriptionV4";

export type CardContentV4Props = HTMLAttributes<HTMLDivElement>;

export const CardContentV4 = forwardRef<HTMLDivElement, CardContentV4Props>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("font-sans text-body", className)}
      {...props}
    />
  ),
);
CardContentV4.displayName = "CardContentV4";

export type CardFooterV4Props = HTMLAttributes<HTMLDivElement>;

export const CardFooterV4 = forwardRef<HTMLDivElement, CardFooterV4Props>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex justify-between items-center pt-4 mt-4 border-t border-celo-dark/[8%] dark:border-celo-light/[8%]",
        className,
      )}
      {...props}
    />
  ),
);
CardFooterV4.displayName = "CardFooterV4";

export { cardV4Variants };
