import { ShieldCheck } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

/**
 * Buyer-protection trust signals — Etalo's core differentiator (escrow)
 * surfaced on the shopping surface. Wording stays in plain "payment /
 * held safely / released on delivery" language (CLAUDE.md rule #4 — no
 * "crypto"/"gas"), never names a wallet address (rule #5).
 *
 * - <BuyerProtectionBadge variant="chip" />   frosted pill over imagery
 *   (the featured hero) — light text, sits on the cinematic scrim.
 * - <BuyerProtectionBadge variant="inline" />  tiny shield + label for a
 *   product card's meta line — subtle, at the point of decision.
 */
export function BuyerProtectionBadge({
  variant = "inline",
  className,
}: {
  variant?: "chip" | "inline";
  className?: string;
}) {
  if (variant === "chip") {
    return (
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full bg-celo-light/15 px-3 py-1 text-sm font-medium text-celo-light backdrop-blur-sm",
          className,
        )}
      >
        <ShieldCheck weight="fill" className="h-3.5 w-3.5" aria-hidden />
        Buyer protected
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm text-celo-forest/80 dark:text-celo-forest-bright/80",
        className,
      )}
    >
      <ShieldCheck weight="fill" className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Buyer protection
    </span>
  );
}

/**
 * Full-width reassurance strip for the top of the marketplace — states
 * the escrow guarantee once, prominently, instead of relying only on
 * the per-card micro-badge.
 */
export function BuyerProtectionStrip({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border border-celo-forest/20 bg-celo-forest-soft px-4 py-3 dark:border-celo-forest-bright/20 dark:bg-celo-forest-bright-soft",
        className,
      )}
      data-testid="buyer-protection-strip"
    >
      <ShieldCheck
        weight="fill"
        className="mt-0.5 h-5 w-5 shrink-0 text-celo-forest dark:text-celo-forest-bright"
        aria-hidden
      />
      <p className="text-sm text-celo-dark/80 dark:text-celo-light/85">
        <span className="font-semibold text-celo-dark dark:text-celo-light">
          Buyer protection on every order.
        </span>{" "}
        Your payment is held safely and released to the seller only when
        you confirm delivery.
      </p>
    </div>
  );
}
