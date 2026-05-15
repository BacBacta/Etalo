"use client";

import { ImageSquare, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

// Phase A P0-2 (2026-05-15) — both dialogs lazy-loaded so the seller
// dashboard's eager bundle (was 276 kB First Load JS, perf score 27)
// drops below 200 kB. ProductFormDialog drags in image upload + photo
// enhance + Pinata + vision Claude wiring (~80-100 kB) ; the seller
// only opens it when adding/editing — pure cold path. DeleteProductDialog
// is smaller but same logic. `loading: () => null` because the dialog
// only mounts when its `open` prop flips to true ; no perceived delay.
const ProductFormDialog = dynamic(
  () =>
    import("@/components/seller/ProductFormDialog").then(
      (m) => m.ProductFormDialog,
    ),
  { ssr: false, loading: () => null },
);
const DeleteProductDialog = dynamic(
  () =>
    import("@/components/seller/DeleteProductDialog").then(
      (m) => m.DeleteProductDialog,
    ),
  { ssr: false, loading: () => null },
);
import { Button } from "@/components/ui/button";
import { EmptyStateV5 } from "@/components/ui/v5/EmptyState";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import {
  MY_PRODUCTS_QUERY_KEY,
  useMyProducts,
} from "@/hooks/useMyProducts";
import {
  type MyProductsListItem,
  type ProductDetail,
  type SellerProfilePublic,
} from "@/lib/seller-api";

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

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
  const queryClient = useQueryClient();
  const productsQuery = useMyProducts({ walletAddress });
  // Treat error and pending the same as the previous "still loading"
  // branch — the dashboard already shows a retry path at a higher
  // level if the seller profile fetch itself fails. Past hard
  // failures here just rendered an empty list with no error toast,
  // so we replicate that.
  // Memoized so the `null` / array reference stays stable between
  // renders that don't actually change the data — avoids cascading
  // re-runs of the count `useMemo` below + child re-renders.
  const products: MyProductsListItem[] | null = useMemo(() => {
    if (productsQuery.isPending) return null;
    return productsQuery.data?.products ?? [];
  }, [productsQuery.isPending, productsQuery.data]);
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

  // Centralized cache invalidation : after a create / edit / delete
  // mutation we invalidate the my-products query key so the next
  // render refetches fresh data. Keeps every active subscriber
  // (this tab + any future Overview-level "products count") in sync.
  const refetchProducts = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: MY_PRODUCTS_QUERY_KEY,
    });
  }, [queryClient]);

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

  // Aggregate counts across statuses so the seller knows at a glance
  // how their catalog is split (the public marketplace only sees
  // `active` rows ; everything else is internal to them). Memoized
  // so the badge doesn't recompute on every keystroke in unrelated
  // form state.
  const counts = useMemo(() => {
    if (!products) return { total: 0, active: 0, draft: 0, paused: 0 };
    return products.reduce(
      (acc, p) => {
        acc.total += 1;
        if (p.status === "active") acc.active += 1;
        else if (p.status === "draft") acc.draft += 1;
        else if (p.status === "paused") acc.paused += 1;
        return acc;
      },
      { total: 0, active: 0, draft: 0, paused: 0 },
    );
  }, [products]);

  if (products === null) {
    return (
      <div className="space-y-3" data-testid="products-skeleton">
        <SkeletonV5 variant="row" />
        <SkeletonV5 variant="row" />
        <SkeletonV5 variant="row" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div data-testid="products-count">
          <p className="text-base">
            {counts.total} product{counts.total !== 1 ? "s" : ""}
          </p>
          {/* Status breakdown — only render when there's at least one
              non-active row to disambiguate. A seller with 4 active
              products doesn't need to see "4 active". */}
          {counts.total > 0 && counts.active !== counts.total ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {counts.active} active
              {counts.draft > 0 ? ` · ${counts.draft} draft` : ""}
              {counts.paused > 0 ? ` · ${counts.paused} paused` : ""}
            </p>
          ) : null}
        </div>
        <Button onClick={openCreate} className="min-h-[44px]">
          <Plus className="mr-2 h-4 w-4" />
          Add product
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyStateV5
          illustration="no-products"
          title="No products yet"
          description="Add your first product to start selling 24/7."
          action={{ label: "Add your first product", onClick: openCreate }}
        />
      ) : (
        <ul className="space-y-2">
          {products.map((p) => {
            const firstImage =
              p.image_ipfs_hashes && p.image_ipfs_hashes.length > 0
                ? p.image_ipfs_hashes[0]
                : null;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 p-3 dark:border-celo-light/10"
              >
                {/* Thumbnail — surfaces the product photo so the
                    seller can scan their catalog visually at scale.
                    Plain <img> for a 56 px square ; next/image perf
                    benefit is negligible at this size. */}
                <div
                  className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-100 dark:bg-celo-dark-elevated"
                  aria-hidden
                >
                  {firstImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${PINATA_GATEWAY}${firstImage}`}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <ImageSquare
                      className="h-6 w-6 text-neutral-400 dark:text-celo-light/40"
                      aria-hidden
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-medium">{p.title}</h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-sm ${STATUS_BADGE[p.status] ?? STATUS_BADGE.draft}`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>
                  <div className="text-sm text-neutral-600 tabular-nums dark:text-neutral-400">
                    {Number(p.price_usdt).toFixed(2)} USDT · stock {p.stock}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-celo-light/70 dark:hover:bg-celo-dark-elevated dark:hover:text-celo-light"
                    aria-label={`Edit ${p.title}`}
                  >
                    <PencilSimple className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openDelete(p)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-celo-red-bright dark:hover:bg-celo-red-bright-soft"
                    aria-label={`Delete ${p.title}`}
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
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
