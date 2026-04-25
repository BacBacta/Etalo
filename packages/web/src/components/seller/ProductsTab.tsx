"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { DeleteProductDialog } from "@/components/seller/DeleteProductDialog";
import { ProductFormDialog } from "@/components/seller/ProductFormDialog";
import { Button } from "@/components/ui/button";
import {
  fetchPublicBoutique,
  fetchPublicProduct,
  type BoutiquePublic,
} from "@/lib/api";
import {
  ipfsHashFromUrl,
  type ProductDetail,
  type SellerProfilePublic,
} from "@/lib/seller-api";

interface Props {
  profile: SellerProfilePublic;
  walletAddress: string;
}

type ProductRow = BoutiquePublic["products"][number];

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  paused: "Paused",
  deleted: "Deleted",
};

export function ProductsTab({ profile, walletAddress }: Props) {
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingProduct, setEditingProduct] = useState<ProductDetail | null>(
    null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const refetchProducts = useCallback(() => {
    fetchPublicBoutique(profile.shop_handle, 1, 50)
      .then((d) => setProducts(d?.products ?? []))
      .catch(() => setProducts([]));
  }, [profile.shop_handle]);

  useEffect(() => {
    refetchProducts();
  }, [refetchProducts]);

  const openCreate = () => {
    setFormMode("create");
    setEditingProduct(null);
    setFormOpen(true);
  };

  const openEdit = async (row: ProductRow) => {
    // The boutique listing omits description + status + raw IPFS hashes,
    // so we hydrate the editor with the single-product page payload and
    // reverse the gateway URLs into hashes for the ImageUploader.
    const fetched = await fetchPublicProduct(profile.shop_handle, row.slug);
    if (!fetched) return;
    const hashes = fetched.image_urls
      .map(ipfsHashFromUrl)
      .filter((h): h is string => h !== null);
    setEditingProduct({
      id: fetched.id,
      seller_id: "", // unused by the form
      title: fetched.title,
      slug: fetched.slug,
      description: fetched.description ?? null,
      price_usdt: fetched.price_usdt,
      stock: fetched.stock,
      status: fetched.status,
      image_ipfs_hashes: hashes,
      category: null,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    });
    setFormMode("edit");
    setFormOpen(true);
  };

  const openDelete = (row: ProductRow) => {
    setDeleteTarget({ id: row.id, title: row.title });
    setDeleteOpen(true);
  };

  if (products === null) {
    return <p className="text-base text-neutral-600">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-base">
          {products.length} product{products.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={openCreate} className="min-h-[44px]">
          <Plus className="mr-2 h-4 w-4" />
          Add product
        </Button>
      </div>

      {products.length === 0 ? (
        <p className="py-8 text-center text-base text-neutral-600">
          No products yet. Click &ldquo;Add product&rdquo; to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {products.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 p-3"
            >
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-medium">{p.title}</h3>
                <div className="text-sm text-neutral-600">
                  {Number(p.price_usdt).toFixed(2)} USDT · stock {p.stock} ·{" "}
                  {STATUS_LABEL.active}
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  aria-label={`Edit ${p.title}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openDelete(p)}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-red-600 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Delete ${p.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        walletAddress={walletAddress}
        mode={formMode}
        initialProduct={editingProduct}
        onSuccess={refetchProducts}
      />

      <DeleteProductDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        walletAddress={walletAddress}
        product={deleteTarget}
        onSuccess={refetchProducts}
      />
    </div>
  );
}
