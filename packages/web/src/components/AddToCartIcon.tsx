"use client";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import { useCartStore } from "@/lib/cart-store";

interface Props {
  productId: string;
  productSlug: string;
  sellerHandle: string;
  sellerShopName: string;
  title: string;
  priceUsdt: string;
  imageUrl: string | null;
  stock: number;
}

// Compact "+" overlay used inside ProductCard. Stops propagation so the
// click doesn't trigger the parent <Link> nav.
export function AddToCartIcon({
  productId,
  productSlug,
  sellerHandle,
  sellerShopName,
  title,
  priceUsdt,
  imageUrl,
  stock,
}: Props) {
  const addItem = useCartStore((state) => state.addItem);
  const disabled = stock <= 0;

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    addItem({
      productId,
      productSlug,
      sellerHandle,
      sellerShopName,
      title,
      priceUsdt,
      imageUrl,
      stockSnapshot: stock,
    });
    toast.success(`Added ${title} to cart`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="absolute bottom-2 right-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:opacity-40"
      aria-label={disabled ? `${title} out of stock` : `Add ${title} to cart`}
    >
      <Plus className="h-5 w-5" />
    </button>
  );
}
