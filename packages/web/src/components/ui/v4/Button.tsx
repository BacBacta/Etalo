import { forwardRef, type ButtonHTMLAttributes, type ElementType } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { m } from "motion/react";

import { cn } from "@/components/ui/v4/utils";

const buttonV4Variants = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center gap-2",
    "font-sans font-medium whitespace-nowrap",
    "transition-colors duration-200 ease-out",
    "outline-none select-none",
    "focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-celo-forest-bright dark:focus-visible:ring-offset-celo-dark-bg",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-celo-forest text-celo-light hover:bg-celo-forest-dark dark:bg-celo-green dark:text-celo-dark dark:hover:bg-celo-green-hover",
        secondary:
          "bg-celo-yellow text-celo-dark hover:bg-celo-yellow-soft",
        ghost:
          "bg-transparent text-celo-forest hover:bg-celo-forest-soft dark:text-celo-forest-bright dark:hover:bg-celo-forest-bright-soft",
        outline:
          "border border-celo-forest bg-transparent text-celo-forest hover:bg-celo-forest-soft dark:border-celo-forest-bright dark:text-celo-forest-bright dark:hover:bg-celo-forest-bright-soft",
      },
      size: {
        sm: "h-9 px-4 text-label",
        md: "h-11 px-5 text-body",
        lg: "h-12 px-6 text-body-lg",
      },
      rounded: {
        pill: "rounded-pill",
        "2xl": "rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      rounded: "pill",
    },
  },
);

export interface ButtonV4Props
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonV4Variants> {
  asChild?: boolean;
  loading?: boolean;
}

const SpinnerIcon = () => (
  <svg
    aria-hidden="true"
    className="size-4 animate-spin"
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeOpacity="0.25"
      strokeWidth="3"
    />
    <path
      d="M22 12a10 10 0 0 1-10 10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

// J10-V5 Phase 2 Block 2 — motion press scale 0.98 + hover scale 1.01.
// CSS-based `active:translate-y-px` removed from primary/secondary so
// motion drives `transform` exclusively; CSS transition scoped to
// `transition-colors` so background/text shifts stay on the CSS path
// and don't fight motion's spring on `transform`. Spring tuning
// stiffness=400 damping=17 lands around 150-200ms perceived (V5 doc
// 200ms button-feedback timing).
//
// asChild=true bypasses motion entirely — Slot from Radix doesn't wrap
// for animations, and link-as-button is a rare path where press
// feedback is not idiomatic. data-motion-active marker reflects the
// runtime decision so vitest can regression-guard the control flow
// (JSDom doesn't execute motion, so direct animation assertions are
// unavailable).
export const ButtonV4 = forwardRef<HTMLButtonElement, ButtonV4Props>(
  (
    {
      className,
      variant,
      size,
      rounded,
      asChild = false,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    const motionActive = !asChild && !isDisabled;
    // ElementType widens the prop check across the Slot / m.button union
    // so the shared attrs below (disabled, aria-busy, data-*) and the
    // motion-only props (whileTap / whileHover / transition) both pass
    // TypeScript without a per-branch render or unsafe casts.
    const Comp: ElementType = asChild ? Slot : m.button;
    const classes = cn(
      buttonV4Variants({ variant, size, rounded }),
      className,
    );
    return (
      <Comp
        ref={ref}
        className={classes}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        data-motion-active={motionActive || undefined}
        {...(motionActive
          ? {
              whileTap: { scale: 0.98 },
              whileHover: { scale: 1.01 },
              transition: {
                type: "spring" as const,
                stiffness: 400,
                damping: 17,
              },
            }
          : {})}
        {...props}
      >
        {loading ? (
          <>
            <span className="absolute inset-0 flex items-center justify-center">
              <SpinnerIcon />
            </span>
            <span className="opacity-0">{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
ButtonV4.displayName = "ButtonV4";

export { buttonV4Variants };
