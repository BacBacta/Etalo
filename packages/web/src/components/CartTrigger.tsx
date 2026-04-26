"use client";

import { ShoppingBag } from "lucide-react";
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
      className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
      aria-label={`Open cart (${displayCount} items)`}
    >
      <ShoppingBag className="h-6 w-6" />
      {displayCount > 0 ? (
        <Badge
          variant="default"
          className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center px-1 text-sm"
        >
          {displayCount > 99 ? "99+" : displayCount}
        </Badge>
      ) : null}
    </button>
  );
}
