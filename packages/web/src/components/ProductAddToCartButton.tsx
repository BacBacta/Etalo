"use client";

import { ShoppingBagOpen } from "@phosphor-icons/react";
import { toast } from "sonner";

import { ButtonV4 } from "@/components/ui/v4/Button";
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
  outOfStock: boolean;
}

// Primary CTA on /[handle]/[slug] product page. When the item is
// already in cart, the label flips to "Add another (in cart: N)" so the
// buyer sees their state without a separate inventory pill.
export function ProductAddToCartButton({
  productId,
  productSlug,
  sellerHandle,
  sellerShopName,
  title,
  priceUsdt,
  imageUrl,
  stock,
  outOfStock,
}: Props) {
  const addItem = useCartStore((state) => state.addItem);
  const inCartQty = useCartStore((state) => state.getItemQty(productId));

  const handleClick = () => {
    if (outOfStock) return;
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

  let label: string;
  if (outOfStock) {
    label = "Out of stock";
  } else if (inCartQty > 0) {
    label = `Add another · ${inCartQty} in cart`;
  } else {
    label = "Add to cart";
  }

  return (
    <ButtonV4
      type="button"
      onClick={handleClick}
      disabled={outOfStock}
      size="lg"
      className="h-12 flex-1"
    >
      {!outOfStock ? (
        <ShoppingBagOpen weight="bold" className="h-5 w-5" aria-hidden />
      ) : null}
      {label}
    </ButtonV4>
  );
}
