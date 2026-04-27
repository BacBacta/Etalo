import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/ui/v4/utils";

const badgeV4Variants = cva(
  [
    "inline-flex items-center gap-1.5",
    "rounded-pill px-3 py-1",
    "font-sans text-overline",
    "transition-colors duration-200",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-celo-dark/[8%] text-celo-dark",
        forest: "bg-celo-forest-soft text-celo-forest",
        yellow: "bg-celo-yellow-soft text-celo-dark",
        red: "bg-celo-red-soft text-celo-red",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeV4Props
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeV4Variants> {
  dot?: boolean;
  pulse?: boolean;
}

export const BadgeV4 = forwardRef<HTMLSpanElement, BadgeV4Props>(
  ({ className, variant, dot, pulse, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeV4Variants({ variant }), className)}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          data-testid="badge-dot"
          data-pulse={pulse || undefined}
          className={cn(
            "inline-block size-1.5 rounded-full bg-current",
            pulse && "animate-celo-pulse",
          )}
        />
      )}
      {children}
    </span>
  ),
);
BadgeV4.displayName = "BadgeV4";

export { badgeV4Variants };
