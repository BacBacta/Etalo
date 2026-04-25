"use client";

import { ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useCartStore } from "@/lib/cart-store";

interface Props {
  onClick: () => void;
}

export function CartTrigger({ onClick }: Props) {
  const itemCount = useCartStore((state) => state.getItemCount());

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
      aria-label={`Open cart (${itemCount} items)`}
    >
      <ShoppingBag className="h-6 w-6" />
      {itemCount > 0 ? (
        <Badge
          variant="default"
          className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center px-1 text-sm"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </Badge>
      ) : null}
    </button>
  );
}
