import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/ui/v4/utils";

const buttonV4Variants = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center gap-2",
    "font-sans font-medium whitespace-nowrap",
    "transition-all duration-200 ease-out",
    "outline-none select-none",
    "focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 focus-visible:ring-offset-white",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-celo-forest text-celo-light hover:bg-celo-forest-dark active:translate-y-px active:shadow-celo-sm",
        secondary:
          "bg-celo-yellow text-celo-dark hover:bg-celo-yellow-soft active:translate-y-px",
        ghost:
          "bg-transparent text-celo-forest hover:bg-celo-forest-soft",
        outline:
          "border border-celo-forest bg-transparent text-celo-forest hover:bg-celo-forest-soft",
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
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;
    return (
      <Comp
        ref={ref}
        className={cn(buttonV4Variants({ variant, size, rounded }), className)}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
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
