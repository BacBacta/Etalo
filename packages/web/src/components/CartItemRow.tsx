"use client";

import { Minus, Plus, X } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";

import { useCartStore, type CartItem } from "@/lib/cart-store";

interface Props {
  item: CartItem;
  // The drawer-level setOpen so clicking the title link closes the drawer
  // before the SPA navigation lands on the next page.
  onNavigate?: () => void;
}

export function CartItemRow({ item, onNavigate }: Props) {
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);

  const subtotal = (Number(item.priceUsdt) * item.qty).toFixed(2);
  const canIncrement = item.qty < item.stockSnapshot;
  const atMax = item.qty === item.stockSnapshot;

  // Shared classes for the qty +/- and remove icon-only buttons. Touch
  // target promoted 36 → 44 px (CLAUDE.md min) ; focus-visible ring +
  // dark mode variants added in the same pass.
  const ICON_BTN_BASE =
    "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest";

  return (
    <div className="flex gap-3">
      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-neutral-100 dark:bg-celo-dark-elevated">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500 dark:text-celo-light/50">
            No img
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={`/${item.sellerHandle}/${item.productSlug}`}
          onClick={onNavigate}
          className="line-clamp-1 block text-base font-medium text-celo-dark hover:underline dark:text-celo-light"
        >
          {item.title}
        </Link>
        <div className="mt-1 text-sm text-neutral-600 tabular-nums dark:text-celo-light/70">
          {Number(item.priceUsdt).toFixed(2)} USDT each
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateQty(item.productId, item.qty - 1)}
            className={`${ICON_BTN_BASE} border border-neutral-300 hover:bg-neutral-50 dark:border-celo-light/20 dark:hover:bg-celo-dark-elevated`}
            aria-label={`Decrease quantity of ${item.title}`}
          >
            <Minus className="h-4 w-4 text-celo-dark dark:text-celo-light" />
          </button>
          <span className="min-w-[24px] text-center text-base tabular-nums text-celo-dark dark:text-celo-light">
            {item.qty}
          </span>
          <button
            type="button"
            onClick={() => updateQty(item.productId, item.qty + 1)}
            disabled={!canIncrement}
            className={`${ICON_BTN_BASE} border border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-celo-light/20 dark:hover:bg-celo-dark-elevated`}
            aria-label={`Increase quantity of ${item.title}`}
          >
            <Plus className="h-4 w-4 text-celo-dark dark:text-celo-light" />
          </button>
          {atMax ? (
            <span className="ml-1 text-sm text-neutral-500 dark:text-celo-light/60">
              (max)
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => removeItem(item.productId)}
            className={`${ICON_BTN_BASE} ml-auto text-neutral-500 hover:bg-neutral-100 dark:text-celo-light/60 dark:hover:bg-celo-dark-elevated`}
            aria-label={`Remove ${item.title}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="self-start text-sm font-medium text-neutral-900 tabular-nums dark:text-celo-light">
        {subtotal}
      </div>
    </div>
  );
}
