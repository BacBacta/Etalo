"use client";

import { useEffect, useState } from "react";

import { fetchPublicBoutique, type BoutiquePublic } from "@/lib/api";
import type { SellerProfilePublic } from "@/lib/seller-api";

interface Props {
  profile: SellerProfilePublic;
}

type BoutiqueProduct = BoutiquePublic["products"][number];

export function ProductsTab({ profile }: Props) {
  const [products, setProducts] = useState<BoutiqueProduct[] | null>(null);

  useEffect(() => {
    fetchPublicBoutique(profile.shop_handle, 1, 50)
      .then((d) => setProducts(d?.products ?? []))
      .catch(() => setProducts([]));
  }, [profile.shop_handle]);

  if (products === null) {
    return <p className="text-base text-neutral-600">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-base">
          {products.length} product{products.length !== 1 ? "s" : ""}
        </p>
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-md bg-neutral-200 px-4 py-2 text-base text-neutral-500"
          title="Coming in Étape 8.3"
        >
          + Add product (coming next)
        </button>
      </div>
      {products.length === 0 ? (
        <p className="text-base text-neutral-600">
          No products yet. Add your first one in Étape 8.3.
        </p>
      ) : (
        <ul className="space-y-2">
          {products.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-neutral-200 p-3"
            >
              <div>
                <h3 className="text-base font-medium">{p.title}</h3>
                <div className="text-sm text-neutral-600">
                  {Number(p.price_usdt).toFixed(2)} USDT · stock {p.stock}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
