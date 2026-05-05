/**
 * EmptyStateV5 — engagement-oriented empty state surface (J10-V5
 * Phase 3 Block 5a). Replaces passive "No X yet" plain text with a
 * Recraft-illustrated regional surface that includes a primary CTA.
 *
 * See docs/DESIGN_V5_PREVIEW.md §Empty states comme engagement.
 *
 * Asset enum maps to the 4 SVGs produced in Phase 3 Block 2 and stored
 * under packages/web/public/illustrations/v5/empty-*.svg. The image is
 * decorative (alt="" + aria-hidden) — title and description carry the
 * meaning for assistive tech, and the wrapper exposes the title via
 * aria-label.
 */
import {
  forwardRef,
  type HTMLAttributes,
  type MouseEventHandler,
} from "react";

import { cn } from "@/components/ui/v4/utils";

// Visual match for ButtonV4 primary (forest / pill / md size) without
// pulling ButtonV4 itself into the bundle. EmptyStateV5 is consumed
// from /seller/dashboard tabs (Orders / Products / Marketing / Stake)
// where the dashboard chunk did not previously depend on motion/react
// or @radix-ui/react-slot — using ButtonV4 here pulled +17 KB into the
// route's First Load JS, exhausting the 280 KB strict budget. Empty-
// state CTAs are low-frequency taps, so the motion press-scale of
// ButtonV4 is not worth that cost. Keep classes in lockstep with
// ButtonV4 primary if the design palette shifts.
const ACTION_CLASSES = [
  "inline-flex items-center justify-center gap-2",
  "h-11 px-5",
  "font-sans font-medium text-body",
  "rounded-pill whitespace-nowrap",
  "bg-celo-forest text-celo-light hover:bg-celo-forest-dark",
  "dark:bg-celo-green dark:text-celo-dark dark:hover:bg-celo-green-hover",
  "transition-colors duration-200 ease-out",
  "outline-none",
  "focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 focus-visible:ring-offset-white",
  "dark:focus-visible:ring-celo-forest-bright dark:focus-visible:ring-offset-celo-dark-bg",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

export type EmptyStateV5Asset =
  | "no-orders"
  | "no-products"
  | "no-marketing"
  | "no-stake";

const ASSET_PATH: Record<EmptyStateV5Asset, string> = {
  "no-orders": "/illustrations/v5/empty-no-orders.svg",
  "no-products": "/illustrations/v5/empty-no-products.svg",
  "no-marketing": "/illustrations/v5/empty-no-marketing.svg",
  "no-stake": "/illustrations/v5/empty-no-stake.svg",
};

type EmptyStateV5Action =
  | { label: string; onClick: MouseEventHandler<HTMLButtonElement>; href?: never }
  | { label: string; href: string; onClick?: never };

export interface EmptyStateV5Props extends HTMLAttributes<HTMLDivElement> {
  illustration: EmptyStateV5Asset;
  title: string;
  description?: string;
  action?: EmptyStateV5Action;
  variant?: "default" | "compact";
}

export const EmptyStateV5 = forwardRef<HTMLDivElement, EmptyStateV5Props>(
  (
    {
      illustration,
      title,
      description,
      action,
      variant = "default",
      className,
      ...props
    },
    ref,
  ) => {
    const isCompact = variant === "compact";

    return (
      <div
        ref={ref}
        role="region"
        aria-label={title}
        data-variant={variant}
        className={cn(
          "flex flex-col items-center text-center",
          isCompact ? "max-w-sm gap-3" : "max-w-md gap-6",
          "mx-auto px-4 py-8",
          className,
        )}
        {...props}
      >
        {/*
          Vector SVG illustration (~2-6 KB, no resizing needed). next/image
          would force a wrapped layout component + multi-srcSet pipeline
          that adds zero value for vectors and ships extra runtime JS, so
          a plain <img> is the right primitive here.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ASSET_PATH[illustration]}
          alt=""
          aria-hidden="true"
          loading="lazy"
          data-testid="empty-illustration"
          data-asset={illustration}
          className={cn(
            "block h-auto w-auto",
            isCompact ? "max-w-[80px]" : "max-w-[160px] md:max-w-[200px]",
          )}
        />
        <div className={cn(isCompact ? "space-y-1" : "space-y-2")}>
          <h3
            className={cn(
              "font-display text-celo-dark dark:text-celo-light",
              isCompact ? "text-display-4" : "text-display-3",
            )}
          >
            {title}
          </h3>
          {description && (
            <p className="font-sans text-body-sm text-celo-dark/60 dark:text-celo-light/60">
              {description}
            </p>
          )}
        </div>
        {action && <EmptyStateAction action={action} />}
      </div>
    );
  },
);
EmptyStateV5.displayName = "EmptyStateV5";

function EmptyStateAction({ action }: { action: EmptyStateV5Action }) {
  if ("href" in action && action.href) {
    return (
      <a
        href={action.href}
        data-testid="empty-state-action"
        className={ACTION_CLASSES}
      >
        {action.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      data-testid="empty-state-action"
      className={ACTION_CLASSES}
    >
      {action.label}
    </button>
  );
}

export { ASSET_PATH as EMPTY_STATE_ASSET_PATH };
