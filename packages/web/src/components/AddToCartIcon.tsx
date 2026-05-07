"use client";

import { Plus } from "@phosphor-icons/react";
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
  /** Where to anchor the absolute-positioned button inside the
   *  parent. Default `bottom-right` matches the boutique
   *  ProductCard layout. `top-right` is used by MarketplaceProductCard
   *  so the button sits inside the image area instead of overlapping
   *  the price/seller meta footer. */
  position?: "bottom-right" | "top-right";
}

const POSITION_CLASSES: Record<NonNullable<Props["position"]>, string> = {
  "bottom-right": "bottom-2 right-2",
  "top-right": "top-2 right-2",
};

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
  position = "bottom-right",
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
      className={`absolute ${POSITION_CLASSES[position]} inline-flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900/90 text-white shadow-md backdrop-blur-sm hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:opacity-40`}
      aria-label={disabled ? `${title} out of stock` : `Add ${title} to cart`}
    >
      <Plus className="h-5 w-5" />
    </button>
  );
}
