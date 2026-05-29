/**
 * PremiumOrderSummary — the idle-phase order recap that replaces the
 * earlier flat header + 3-line summary on `/checkout`.
 *
 * Why this exists (UX brief) :
 *  - The previous summary was a single number ("3 sellers · 5 items")
 *    that gave the buyer no visual sense of who they were paying. In
 *    informal African ecom, the seller's identity IS the trust signal —
 *    surface the shop name + a colored initials avatar per group, plus
 *    the per-seller subtotal so the buyer can verify each row.
 *  - The total was USDT-only. Many V1 buyers don't have an intuitive
 *    feel for USDT magnitudes ; we surface an approximate local
 *    currency anchor (₦ / GH₵ / KSh / R) derived from the buyer's
 *    country so they read "about ₦38 500" alongside "25.00 USDT".
 *  - Escrow protection is the platform's core value prop. The old
 *    surface mentioned it nowhere — buyers had to trust based on the
 *    Etalo brand alone. We add a compact trust row : "Held in escrow
 *    until you confirm delivery."
 */
"use client";

import { ShieldCheck } from "@phosphor-icons/react";

import { formatLocalCurrencyHint } from "@/lib/local-currency";
import type { ResolvedCart } from "@/lib/checkout";

interface Props {
  cart: ResolvedCart;
  /** Buyer country (ISO-3) from useBuyerCountry — drives the local-
   *  currency hint chips. Null = no hint rendered (no layout shift,
   *  the row collapses). */
  buyerCountry: string | null;
}

// Stable per-shop color derived from the handle so the same seller
// always gets the same swatch across orders. Six muted-but-saturated
// tones tested for AA contrast on white text.
const AVATAR_PALETTE = [
  "bg-celo-forest",
  "bg-emerald-700",
  "bg-amber-700",
  "bg-rose-700",
  "bg-indigo-700",
  "bg-cyan-800",
];

function pickAvatarColor(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i++) {
    h = (h * 31 + handle.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initials(shopName: string): string {
  const cleaned = shopName.trim();
  if (!cleaned) return "?";
  const words = cleaned.split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function PremiumOrderSummary({ cart, buyerCountry }: Props) {
  const totalHint = formatLocalCurrencyHint(cart.total_usdt, buyerCountry);
  const itemCount = cart.groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <section
      data-testid="premium-order-summary"
      className="rounded-2xl border border-neutral-200 bg-white shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated dark:shadow-none"
    >
      <header className="border-b border-neutral-100 px-5 pb-3 pt-4 dark:border-celo-light/10">
        <h1
          className="font-display text-display-4 text-celo-dark dark:text-celo-light"
          data-testid="premium-order-summary-title"
        >
          Your order
        </h1>
        <p className="mt-0.5 text-sm text-neutral-600 dark:text-celo-light/65">
          {cart.groups.length} {cart.groups.length === 1 ? "shop" : "shops"} ·{" "}
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </p>
      </header>

      <ul className="divide-y divide-neutral-100 dark:divide-celo-light/10">
        {cart.groups.map((group) => {
          const groupItemCount = group.items.reduce(
            (sum, item) => sum + item.qty,
            0,
          );
          const subtotalHint = formatLocalCurrencyHint(
            group.subtotal_usdt,
            buyerCountry,
          );
          return (
            <li
              key={group.seller_handle}
              data-testid={`order-summary-row-${group.seller_handle}`}
              className="flex items-center gap-3 px-5 py-3"
            >
              <span
                aria-hidden
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${pickAvatarColor(group.seller_handle)}`}
              >
                {initials(group.seller_shop_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-celo-dark dark:text-celo-light">
                  {group.seller_shop_name}
                </p>
                <p className="text-sm text-neutral-500 dark:text-celo-light/60">
                  {groupItemCount}{" "}
                  {groupItemCount === 1 ? "item" : "items"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-base font-semibold tabular-nums text-celo-dark dark:text-celo-light">
                  {Number(group.subtotal_usdt).toFixed(2)} USDT
                </p>
                {subtotalHint ? (
                  <p
                    className="text-sm tabular-nums text-neutral-500 dark:text-celo-light/55"
                    data-testid={`order-summary-hint-${group.seller_handle}`}
                  >
                    {subtotalHint}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-4 dark:border-celo-light/10">
        <span className="text-base font-medium text-celo-dark dark:text-celo-light">
          Total
        </span>
        <div className="text-right">
          <p
            className="text-xl font-semibold tabular-nums text-celo-dark dark:text-celo-light"
            data-testid="order-summary-total-usdt"
          >
            {Number(cart.total_usdt).toFixed(2)} USDT
          </p>
          {totalHint ? (
            <p
              className="text-sm tabular-nums text-neutral-500 dark:text-celo-light/55"
              data-testid="order-summary-total-hint"
            >
              {totalHint}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mx-5 mb-5 mt-1 flex items-start gap-2 rounded-lg bg-celo-forest-soft px-3 py-2.5 text-sm text-celo-forest-dark dark:bg-celo-forest-bright-soft dark:text-celo-forest-bright">
        <ShieldCheck
          className="h-4 w-4 flex-shrink-0 translate-y-0.5"
          weight="fill"
          aria-hidden
        />
        <p>
          Funds held in escrow until you confirm delivery. Auto-refund if
          the seller doesn&apos;t ship on time.
        </p>
      </div>
    </section>
  );
}
