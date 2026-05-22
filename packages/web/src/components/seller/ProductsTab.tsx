"use client";

import {
  ImageSquare,
  List,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SquaresFour,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { IPFS_GATEWAY } from "@/lib/ipfs";
import {
  type MyProductsListItem,
  type ProductDetail,
  type SellerProfilePublic,
} from "@/lib/seller-api";

// Low-stock threshold ; mirror in the KPI tiles + per-row warning.
const LOW_STOCK_THRESHOLD = 5;

// How many rows to render initially before the seller has to click
// "Load more". 24 fills 6 rows of 4 (grid) or 24 rows (list) — well
// inside the React reconciler comfort zone even on a 360 px phone.
const PAGE_SIZE = 24;

interface Props {
  // Kept on the signature for parity with sibling tabs (Overview,
  // Profile) — Étape 8.4 swap to /sellers/me/products dropped its only
  // remaining use (shop_handle for the public boutique fetch).
  profile: SellerProfilePublic;
  walletAddress: string;
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  draft: "bg-neutral-400",
  paused: "bg-amber-500",
  deleted: "bg-rose-500",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  paused: "Paused",
  deleted: "Deleted",
};

type StatusFilter = "all" | "active" | "draft" | "paused";
type SortMode =
  | "newest"
  | "oldest"
  | "price_asc"
  | "price_desc"
  | "stock_asc";
type ViewMode = "list" | "grid";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "stock_asc", label: "Stock: low first" },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ProductsTab({ profile, walletAddress }: Props) {
  const queryClient = useQueryClient();
  const productsQuery = useMyProducts({ walletAddress });
  const products: MyProductsListItem[] | null = useMemo(() => {
    if (productsQuery.isPending) return null;
    return productsQuery.data?.products ?? [];
  }, [productsQuery.isPending, productsQuery.data]);

  // Controls — search input is debounced so each keystroke doesn't
  // re-run the filter + sort pipeline. `searchRaw` lives in the input
  // immediately, `searchDebounced` drives the filtering after 200 ms
  // of quiet (Shopify pattern).
  const [searchRaw, setSearchRaw] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [view, setView] = useState<ViewMode>("list");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset the visible window every time the filter/search/sort change ;
  // otherwise the seller paginates into stale "load more"-zone results
  // that don't match the new criteria.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchDebounced, statusFilter, sort]);

  // Dialog state.
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

  // KPI counts across the FULL product list (not the filtered view).
  // The tiles tell the seller "you have 200 total ; 45 are active ;
  // 12 are running low" regardless of which filter is currently on.
  const counts = useMemo(() => {
    if (!products) {
      return { total: 0, active: 0, draft: 0, paused: 0, lowStock: 0, outOfStock: 0 };
    }
    return products.reduce(
      (acc, p) => {
        acc.total += 1;
        if (p.status === "active") acc.active += 1;
        else if (p.status === "draft") acc.draft += 1;
        else if (p.status === "paused") acc.paused += 1;
        if (p.status === "active") {
          if (p.stock === 0) acc.outOfStock += 1;
          else if (p.stock < LOW_STOCK_THRESHOLD) acc.lowStock += 1;
        }
        return acc;
      },
      {
        total: 0,
        active: 0,
        draft: 0,
        paused: 0,
        lowStock: 0,
        outOfStock: 0,
      },
    );
  }, [products]);

  // Filter + sort + slice pipeline. Computed in one memo so the
  // intermediate arrays don't re-allocate on every render.
  const filteredSorted = useMemo(() => {
    if (!products) return [];
    const search = searchDebounced.trim().toLowerCase();
    let arr = products;
    if (statusFilter !== "all") {
      arr = arr.filter((p) => p.status === statusFilter);
    }
    if (search.length > 0) {
      arr = arr.filter(
        (p) =>
          p.title.toLowerCase().includes(search) ||
          p.slug.toLowerCase().includes(search),
      );
    }
    const sorted = [...arr];
    switch (sort) {
      case "newest":
        sorted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        break;
      case "price_asc":
        sorted.sort((a, b) => Number(a.price_usdt) - Number(b.price_usdt));
        break;
      case "price_desc":
        sorted.sort((a, b) => Number(b.price_usdt) - Number(a.price_usdt));
        break;
      case "stock_asc":
        sorted.sort((a, b) => a.stock - b.stock);
        break;
    }
    return sorted;
  }, [products, statusFilter, searchDebounced, sort]);

  const visibleProducts = useMemo(
    () => filteredSorted.slice(0, visibleCount),
    [filteredSorted, visibleCount],
  );
  const hasMore = filteredSorted.length > visibleCount;

  if (products === null) {
    return (
      <div className="space-y-3" data-testid="products-skeleton">
        <SkeletonV5 variant="card" className="h-20" />
        <SkeletonV5 variant="card" className="h-20" />
        <SkeletonV5 variant="card" className="h-20" />
      </div>
    );
  }

  // First-load empty state : zero products at all — render the
  // illustrated EmptyStateV5 with the "Add your first product" CTA.
  // Tested as the only special case in ProductsTab.test.tsx.
  if (products.length === 0) {
    return (
      <div className="space-y-4">
        <div data-testid="products-count" className="sr-only">
          0 products
        </div>
        <EmptyStateV5
          illustration="no-products"
          title="No products yet"
          description="Add your first product to start selling 24/7."
          action={{ label: "Add your first product", onClick: openCreate }}
        />
        <ProductFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          walletAddress={walletAddress}
          mode={formMode}
          initialProduct={editingProduct}
          onSuccess={refetchProducts}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI tiles — at-a-glance catalog health. Active count + low-
          stock + out-of-stock are the actionable numbers a seller
          scans every morning. */}
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
        data-testid="products-count"
      >
        <KpiTile label="Total" value={counts.total} />
        <KpiTile label="Active" value={counts.active} tone="success" />
        <KpiTile
          label="Low stock"
          value={counts.lowStock}
          tone={counts.lowStock > 0 ? "warn" : "neutral"}
          hint={`< ${LOW_STOCK_THRESHOLD}`}
        />
        <KpiTile
          label="Out of stock"
          value={counts.outOfStock}
          tone={counts.outOfStock > 0 ? "danger" : "neutral"}
        />
      </div>

      {/* Search + Add product. The search input is the headline
          control at scale — a seller with 50 + products almost always
          opens this tab to find a specific item. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400 dark:text-celo-light/40"
            aria-hidden
          />
          <input
            type="search"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Search products by name or slug"
            data-testid="products-search"
            className="min-h-[44px] w-full rounded-full border border-neutral-300 bg-white pl-10 pr-4 text-base text-celo-dark placeholder:text-neutral-400 focus:border-celo-forest focus:outline-none focus:ring-1 focus:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
          />
        </div>
        <Button
          onClick={openCreate}
          className="min-h-[44px] flex-shrink-0"
          data-testid="products-add-cta"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add product
        </Button>
      </div>

      {/* Filter chips + sort + view toggle. Stacks on small viewports
          so chips don't get cramped against the sort dropdown. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter products by status"
        >
          <FilterChip
            label="All"
            count={counts.total}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <FilterChip
            label="Active"
            count={counts.active}
            active={statusFilter === "active"}
            onClick={() => setStatusFilter("active")}
            dotClass="bg-emerald-500"
          />
          <FilterChip
            label="Draft"
            count={counts.draft}
            active={statusFilter === "draft"}
            onClick={() => setStatusFilter("draft")}
            dotClass="bg-neutral-400"
          />
          <FilterChip
            label="Paused"
            count={counts.paused}
            active={statusFilter === "paused"}
            onClick={() => setStatusFilter("paused")}
            dotClass="bg-amber-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="products-sort"
            className="text-sm text-neutral-600 dark:text-celo-light/70"
          >
            Sort
          </label>
          <select
            id="products-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="min-h-[44px] rounded-md border border-neutral-300 bg-white px-3 text-base text-celo-dark focus:outline-none focus:ring-2 focus:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* List / Grid view toggle — same ARIA tabs pattern as the
              OrdersTab toggle (Orders / Pick list) for consistency. */}
          <div
            role="tablist"
            aria-label="Product view mode"
            className="inline-flex overflow-hidden rounded-md border border-neutral-200 dark:border-celo-light/20"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "list" ? "true" : "false"}
              aria-label="List view"
              onClick={() => setView("list")}
              className={`inline-flex h-11 w-11 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest ${
                view === "list"
                  ? "bg-celo-dark text-celo-light dark:bg-celo-light dark:text-celo-dark"
                  : "bg-white text-neutral-700 hover:bg-neutral-50 dark:bg-celo-dark-elevated dark:text-celo-light/70 dark:hover:bg-celo-dark-bg"
              }`}
            >
              <List className="h-4 w-4" weight="regular" />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "grid" ? "true" : "false"}
              aria-label="Grid view"
              onClick={() => setView("grid")}
              className={`inline-flex h-11 w-11 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest ${
                view === "grid"
                  ? "bg-celo-dark text-celo-light dark:bg-celo-light dark:text-celo-dark"
                  : "bg-white text-neutral-700 hover:bg-neutral-50 dark:bg-celo-dark-elevated dark:text-celo-light/70 dark:hover:bg-celo-dark-bg"
              }`}
            >
              <SquaresFour className="h-4 w-4" weight="regular" />
            </button>
          </div>
        </div>
      </div>

      {/* Filtered result count — only show when search OR a non-"all"
          filter is active, so it doesn't repeat the KPI total. */}
      {(searchDebounced.trim().length > 0 || statusFilter !== "all") && (
        <p
          className="text-sm text-neutral-500 tabular-nums dark:text-celo-light/60"
          data-testid="products-filtered-count"
        >
          {filteredSorted.length} {filteredSorted.length === 1 ? "match" : "matches"}
        </p>
      )}

      {/* Empty state per filter : zero matches but products do exist
          overall (the top-level no-products branch already handled the
          "really empty" case). */}
      {filteredSorted.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center dark:border-celo-light/10 dark:bg-celo-dark-elevated">
          <h3 className="text-base font-medium text-celo-dark dark:text-celo-light">
            No matching products
          </h3>
          <p className="mt-1 text-sm text-neutral-600 dark:text-celo-light/70">
            Try a different search or remove the filter.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearchRaw("");
              setStatusFilter("all");
            }}
            className="mt-4 min-h-[44px]"
          >
            Clear filters
          </Button>
        </div>
      ) : view === "grid" ? (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          data-testid="products-grid"
        >
          {visibleProducts.map((p) => (
            <ProductGridCard
              key={p.id}
              product={p}
              onEdit={() => openEdit(p)}
              onDelete={() => openDelete(p)}
            />
          ))}
        </ul>
      ) : (
        <ul className="space-y-2" data-testid="products-list">
          {visibleProducts.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              onEdit={() => openEdit(p)}
              onDelete={() => openDelete(p)}
            />
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            className="min-h-[44px] min-w-[160px]"
            data-testid="products-load-more"
          >
            Load more ({filteredSorted.length - visibleCount})
          </Button>
        </div>
      ) : null}

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

interface KpiTileProps {
  label: string;
  value: number;
  tone?: "success" | "warn" | "danger" | "neutral";
  hint?: string;
}

function KpiTile({ label, value, tone = "neutral", hint }: KpiTileProps) {
  const valueColor =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "danger"
          ? "text-rose-700 dark:text-rose-300"
          : "text-celo-dark dark:text-celo-light";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-celo-light/10 dark:bg-celo-dark-elevated">
      <div className="text-sm text-neutral-500 dark:text-celo-light/60">
        {label}
        {hint ? (
          <span className="ml-1 text-xs text-neutral-400">({hint})</span>
        ) : null}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}

interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dotClass?: string;
}

function FilterChip({ label, count, active, onClick, dotClass }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest ${
        active
          ? "border-celo-dark bg-celo-dark text-celo-light dark:border-celo-light dark:bg-celo-light dark:text-celo-dark"
          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light/80 dark:hover:bg-celo-dark-bg"
      }`}
    >
      {dotClass ? (
        <span aria-hidden className={`h-2 w-2 rounded-full ${dotClass}`} />
      ) : null}
      {label}
      <span
        className={`tabular-nums ${
          active
            ? "text-celo-light/70 dark:text-celo-dark/70"
            : "text-neutral-500 dark:text-celo-light/50"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

interface ProductRowProps {
  product: MyProductsListItem;
  onEdit: () => void;
  onDelete: () => void;
}

function ProductRow({ product, onEdit, onDelete }: ProductRowProps) {
  const firstImage =
    product.image_ipfs_hashes && product.image_ipfs_hashes.length > 0
      ? product.image_ipfs_hashes[0]
      : null;
  const isActive = product.status === "active";
  const isOutOfStock = isActive && product.stock === 0;
  const isLowStock = isActive && product.stock > 0 && product.stock < LOW_STOCK_THRESHOLD;

  return (
    <li className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-celo-light/10 dark:bg-celo-dark-elevated">
      <div className="flex items-stretch gap-3 p-3">
        {/* Thumbnail bumped 56 → 72 px so the seller can visually
            identify products at scale without opening each row. */}
        <div className="flex h-18 w-18 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 dark:bg-celo-dark-bg" style={{ height: 72, width: 72 }}>
          {firstImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${IPFS_GATEWAY}${firstImage}`}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageSquare
              className="h-7 w-7 text-neutral-400 dark:text-celo-light/40"
              aria-hidden
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-medium text-celo-dark dark:text-celo-light">
              {product.title}
            </h3>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm">
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[product.status] ?? STATUS_DOT.draft}`}
            />
            <span className="text-neutral-600 dark:text-celo-light/70">
              {STATUS_LABEL[product.status] ?? product.status}
            </span>
            <span aria-hidden className="text-neutral-300 dark:text-celo-light/30">·</span>
            <span className="tabular-nums text-celo-dark dark:text-celo-light">
              {Number(product.price_usdt).toFixed(2)} USDT
            </span>
            <span aria-hidden className="text-neutral-300 dark:text-celo-light/30">·</span>
            <StockLabel
              stock={product.stock}
              isOutOfStock={isOutOfStock}
              isLowStock={isLowStock}
            />
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <ActionButton
            label={`Edit ${product.title}`}
            icon={<PencilSimple className="h-4 w-4" />}
            onClick={onEdit}
          />
          <ActionButton
            label={`Delete ${product.title}`}
            icon={<Trash className="h-4 w-4" />}
            onClick={onDelete}
            tone="danger"
          />
        </div>
      </div>
    </li>
  );
}

interface ProductGridCardProps {
  product: MyProductsListItem;
  onEdit: () => void;
  onDelete: () => void;
}

function ProductGridCard({ product, onEdit, onDelete }: ProductGridCardProps) {
  const firstImage =
    product.image_ipfs_hashes && product.image_ipfs_hashes.length > 0
      ? product.image_ipfs_hashes[0]
      : null;
  const isActive = product.status === "active";
  const isOutOfStock = isActive && product.stock === 0;
  const isLowStock = isActive && product.stock > 0 && product.stock < LOW_STOCK_THRESHOLD;

  return (
    <li className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-celo-light/10 dark:bg-celo-dark-elevated">
      <div className="relative aspect-square w-full bg-neutral-100 dark:bg-celo-dark-bg">
        {firstImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${IPFS_GATEWAY}${firstImage}`}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageSquare
              className="h-10 w-10 text-neutral-400 dark:text-celo-light/40"
              aria-hidden
            />
          </div>
        )}
        <span
          className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-sm font-medium shadow-sm backdrop-blur dark:bg-celo-dark-bg/90`}
        >
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[product.status] ?? STATUS_DOT.draft}`}
          />
          {STATUS_LABEL[product.status] ?? product.status}
        </span>
        {(isLowStock || isOutOfStock) && (
          <span
            className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium shadow-sm ${
              isOutOfStock
                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            }`}
          >
            <Warning className="h-3 w-3" weight="bold" />
            {isOutOfStock ? "Out" : `${product.stock} left`}
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate text-base font-medium text-celo-dark dark:text-celo-light">
          {product.title}
        </h3>
        <p className="mt-0.5 text-sm tabular-nums text-celo-dark/80 dark:text-celo-light/80">
          {Number(product.price_usdt).toFixed(2)} USDT
        </p>
        <div className="mt-2 flex items-center gap-1">
          <ActionButton
            label={`Edit ${product.title}`}
            icon={<PencilSimple className="h-4 w-4" />}
            onClick={onEdit}
          />
          <ActionButton
            label={`Delete ${product.title}`}
            icon={<Trash className="h-4 w-4" />}
            onClick={onDelete}
            tone="danger"
          />
        </div>
      </div>
    </li>
  );
}

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "neutral" | "danger";
}

function ActionButton({ label, icon, onClick, tone = "neutral" }: ActionButtonProps) {
  const colorClasses =
    tone === "danger"
      ? "text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-celo-light/70 dark:hover:bg-celo-dark-bg dark:hover:text-celo-light";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest ${colorClasses}`}
    >
      {icon}
    </button>
  );
}

interface StockLabelProps {
  stock: number;
  isOutOfStock: boolean;
  isLowStock: boolean;
}

function StockLabel({ stock, isOutOfStock, isLowStock }: StockLabelProps) {
  if (isOutOfStock) {
    return (
      <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
        <Warning className="h-3.5 w-3.5" weight="bold" aria-hidden />
        Out of stock
      </span>
    );
  }
  if (isLowStock) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
        <Warning className="h-3.5 w-3.5" weight="regular" aria-hidden />
        Low stock · {stock} left
      </span>
    );
  }
  return (
    <span className="tabular-nums text-neutral-600 dark:text-celo-light/70">
      Stock {stock}
    </span>
  );
}

