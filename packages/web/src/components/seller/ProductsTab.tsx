"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { DeleteProductDialog } from "@/components/seller/DeleteProductDialog";
import { ProductFormDialog } from "@/components/seller/ProductFormDialog";
import { Button } from "@/components/ui/button";
import {
  fetchMyProducts,
  type MyProductsListItem,
  type ProductDetail,
  type SellerProfilePublic,
} from "@/lib/seller-api";

interface Props {
  // Kept on the signature for parity with sibling tabs (Overview,
  // Profile) — Étape 8.4 swap to /sellers/me/products dropped its only
  // remaining use (shop_handle for the public boutique fetch).
  profile: SellerProfilePublic;
  walletAddress: string;
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  draft: "bg-neutral-100 text-neutral-700",
  paused: "bg-amber-100 text-amber-800",
  deleted: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  paused: "Paused",
  deleted: "Deleted",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ProductsTab({ profile, walletAddress }: Props) {
  const [products, setProducts] = useState<MyProductsListItem[] | null>(null);
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
    fetchMyProducts(walletAddress)
      .then((d) => setProducts(d.products))
      .catch(() => setProducts([]));
  }, [walletAddress]);

  useEffect(() => {
    refetchProducts();
  }, [refetchProducts]);

  const openCreate = () => {
    setFormMode("create");
    setEditingProduct(null);
    setFormOpen(true);
  };

  const openEdit = (row: MyProductsListItem) => {
    // /sellers/me/products returns the full owner-side payload (incl.
    // raw image_ipfs_hashes), so no second fetch needed.
    setEditingProduct({
      id: row.id,
      seller_id: "",
      title: row.title,
      slug: row.slug,
      description: row.description ?? null,
      price_usdt: String(row.price_usdt),
      stock: row.stock,
      status: row.status,
      image_ipfs_hashes: row.image_ipfs_hashes ?? [],
      category: null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    setFormMode("edit");
    setFormOpen(true);
  };

  const openDelete = (row: MyProductsListItem) => {
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
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-base font-medium">{p.title}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-sm ${STATUS_BADGE[p.status] ?? STATUS_BADGE.draft}`}
                  >
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <div className="text-sm text-neutral-600">
                  {Number(p.price_usdt).toFixed(2)} USDT · stock {p.stock}
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
