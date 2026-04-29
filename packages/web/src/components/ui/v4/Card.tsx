import { forwardRef, type ElementType, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { m } from "motion/react";

import { cn } from "@/components/ui/v4/utils";

const cardV4Variants = cva(
  [
    "rounded-3xl",
    "border",
    // J10-V5 Phase 2 Block 3 — explicit list excludes `transform` so
    // motion's whileHover y can drive the lift on its own without the
    // CSS transition fighting the spring on transform updates. Colors
    // + shadow + border still transition smoothly via CSS.
    "transition-[background-color,box-shadow,border-color] duration-200 ease-out",
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
      },
      interactive: {
        // CSS hover:-translate-y-px removed — motion drives y: -2 (V5
        // doc spec) via whileHover when interactive=true. Shadow shift
        // stays on CSS (separation: motion = transform / CSS = colors,
        // shadows, borders).
        true: "cursor-pointer hover:shadow-celo-lg dark:hover:bg-celo-dark-surface",
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

// J10-V5 Phase 2 Block 3 — first structural component to gain motion
// (vs ButtonV4 atomic in Block 2). Spring stiffness=300 damping=20
// lands ~250-300ms perceived (V5 doc 200-400ms timing range), softer
// than ButtonV4 press (400/17) — lift is contemplative, not snappy.
// data-motion-active marker reflects the runtime decision so vitest
// can regression-guard control flow (JSDom doesn't run motion).
export const CardV4 = forwardRef<HTMLDivElement, CardV4Props>(
  (
    { className, variant, padding, interactive, ...props },
    ref,
  ) => {
    const motionActive = interactive === true;
    const Comp: ElementType = motionActive ? m.div : "div";
    return (
      <Comp
        ref={ref}
        data-interactive={interactive || undefined}
        data-motion-active={motionActive || undefined}
        className={cn(
          cardV4Variants({ variant, padding, interactive }),
          className,
        )}
        {...(motionActive
          ? {
              whileHover: { y: -2 },
              transition: {
                type: "spring" as const,
                stiffness: 300,
                damping: 20,
              },
            }
          : {})}
        {...props}
      />
    );
  },
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
