"use client";

import { ShoppingBag } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useCartStore } from "@/lib/cart-store";

interface Props {
  onClick: () => void;
}

export function CartTrigger({ onClick }: Props) {
  // SSR renders with empty cart (no localStorage on the server). The
  // browser hydrates Zustand `persist` from localStorage, which can
  // produce a non-zero itemCount and render a <Badge>. Without this
  // mounted gate, server HTML lacks the <span> the client expects →
  // hydration mismatch on <button>, then React falls back to full
  // client re-render, which cascades into useSyncExternalStore loop
  // warnings on CartDrawer and "Maximum update depth exceeded".
  const [mounted, setMounted] = useState(false);
  const itemCount = useCartStore((state) => state.getItemCount());
  useEffect(() => setMounted(true), []);

  const displayCount = mounted ? itemCount : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 hover:bg-celo-dark/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-dark focus-visible:ring-offset-2 dark:hover:bg-celo-light/5 dark:focus-visible:ring-celo-light dark:focus-visible:ring-offset-celo-dark-bg"
      aria-label={`Open cart (${displayCount} items)`}
    >
      <ShoppingBag className="h-6 w-6" />
      {displayCount > 0 ? (
        // Override the default Badge variant : the celo-yellow accent
        // (FBCC5C — the logo's circle) gives high contrast on both
        // light AND dark backgrounds, while the default forest-on-light
        // variant disappeared on dark mode (screenshot bug). 22 px tall
        // + ring offset bumps visual weight so it reads as a real
        // notification not a stray decoration.
        <Badge
          variant="default"
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-[22px] min-w-[22px] items-center justify-center bg-celo-yellow px-1.5 text-sm font-semibold leading-none text-celo-dark ring-2 ring-celo-light dark:ring-celo-dark-bg"
        >
          {displayCount > 99 ? "99+" : displayCount}
        </Badge>
      ) : null}
    </button>
  );
}
