"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import {
  fetchMyProducts,
  type MyProductsListItem,
} from "@/lib/seller-api";

interface Props {
  selected: MyProductsListItem | null;
  onSelect: (product: MyProductsListItem) => void;
}

export function ProductPicker({ selected, onSelect }: Props) {
  const { address } = useAccount();
  const [products, setProducts] = useState<MyProductsListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMyProducts(address)
      .then((d) => {
        if (cancelled) return;
        setProducts(d.products.filter((p) => p.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (loading) {
    // J10-V5 Phase 5 Angle B sub-block B.2 — SkeletonV5 form-select-
    // shaped placeholder mirrors the real <select> dimensions
    // (min-h-[44px] = h-11) so the picker doesn't shift when products
    // resolve.
    return (
      <SkeletonV5
        variant="rectangle"
        className="h-11 w-full max-w-md rounded-md"
      />
    );
  }
  if (products.length === 0) {
    return (
      <p
        className="text-base text-neutral-700"
        data-testid="no-active-products"
      >
        No active products. Add or activate a product first in the Products
        tab.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label
        className="block text-base font-medium"
        htmlFor="marketing-product-picker"
      >
        Select product
      </label>
      <select
        id="marketing-product-picker"
        value={selected?.id ?? ""}
        onChange={(e) => {
          const p = products.find((x) => x.id === e.target.value);
          if (p) onSelect(p);
        }}
        className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
        data-testid="product-picker-select"
      >
        <option value="">— Choose a product —</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title} ({Number(p.price_usdt).toFixed(2)} USDT)
          </option>
        ))}
      </select>
    </div>
  );
}
