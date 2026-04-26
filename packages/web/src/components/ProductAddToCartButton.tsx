"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
    label = `Add another (in cart: ${inCartQty})`;
  } else {
    label = "Add to cart";
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={outOfStock}
      size="lg"
      className="h-12 w-full text-base font-medium"
    >
      {label}
    </Button>
  );
}
