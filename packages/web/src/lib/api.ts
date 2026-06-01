import { fetchApi } from "@/lib/fetch-api";
import { WALLET_AUTH_HEADER } from "@/lib/wallet-auth";
import type { paths } from "@/types/api.gen";

export interface ProductPublic {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price_usdt: string;
  stock: number;
  status: string;
  image_urls: string[];
  seller: {
    shop_handle: string;
    shop_name: string;
    logo_url: string | null;
    country: string | null;
  };
}

// Boutique listing — typed against the OpenAPI schema generated in
// J6 Block 1. The backend endpoint was added in J6 Block 2 Étape A
// (commit d3d7fd7).
export type BoutiquePublic =
  paths["/api/v1/products/public/{handle}"]["get"]["responses"]["200"]["content"]["application/json"];

// Marketplace listing — backend endpoint added in J6 Block 7 Étape 7.1
// (commit f4fe3a2). Cursor-based pagination (?after=<iso_dt>&limit=N).
export type MarketplaceListResponse =
  paths["/api/v1/marketplace/products"]["get"]["responses"]["200"]["content"]["application/json"];

// Augmented with the P4 social-proof fields the backend now returns
// from the reputation-mirror join. Optional intersection until
// `pnpm gen:api` re-runs against the live backend — at which point the
// generated type carries them natively and this becomes redundant.
export type MarketplaceProductItem =
  MarketplaceListResponse["products"][number] & {
    seller_orders_completed?: number;
    seller_is_top_seller?: boolean;
  };

// Lightweight seller summary derived from marketplace data — used by
// the public landing page (Étape 7.3) to show a few featured sellers
// without an extra backend round-trip.
export interface FeaturedSeller {
  handle: string;
  shop_name: string;
  country: string | null;
  primary_image_url: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`API ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type ApiOptions = RequestInit & {
  wallet?: string;
};

// Generic authenticated/unauthenticated fetch wrapper for backend
// mutations. The EIP-191 signed-message auth path that used to live
// here was removed alongside its lib/eip191.ts module per ADR-034
// (MiniPay forbids signed-message auth for backend access). All
// mutations now use the X-Wallet-Address header pattern, gated at
// the backend by `ENFORCE_JWT_AUTH` (ADR-046, hard-flipped on
// mainnet).
export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { wallet, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  const isFormData = rest.body instanceof FormData;
  if (!finalHeaders.has("Content-Type") && rest.body && !isFormData) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (wallet) {
    finalHeaders.set(WALLET_AUTH_HEADER, wallet);
  }

  const res = await fetchApi(path, { ...rest, headers: finalHeaders });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(res.status, body);
  }

  return (await res.json()) as T;
}

export async function fetchPublicProduct(
  handle: string,
  slug: string,
): Promise<ProductPublic | null> {
  const res = await fetchApi(
    `/products/public/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`,
    { next: { revalidate: 60 } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }
  return (await res.json()) as ProductPublic;
}

export async function fetchPublicBoutique(
  handle: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<BoutiquePublic | null> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  const res = await fetchApi(
    `/products/public/${encodeURIComponent(handle)}?${params.toString()}`,
    { next: { revalidate: 30 } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Boutique fetch failed: ${res.status}`);
  }
  return (await res.json()) as BoutiquePublic;
}

export interface FetchMarketplaceProductsArgs {
  cursor?: string | null;
  limit?: number;
  /** Country filter (NGA / GHA / KEN / "all"). Omit or pass "all" for no
   *  filter. J11.7 Block 9 (ADR-045). */
  country?: string | null;
  /** Optional case-insensitive substring search over Product.title.
   *  Empty / undefined disables search. Trimmed by the backend. */
  q?: string | null;
  /** Category filter (fashion / beauty / food / home / other / "all").
   *  Omit or pass "all" for no filter. */
  category?: string | null;
  /** Sort order : "newest" / "popular" / "price_asc" / "price_desc".
   *  Defaults to backend's "newest" if omitted. */
  sort?: string | null;
}

export async function fetchMarketplaceProducts(
  cursorOrArgs?: string | null | FetchMarketplaceProductsArgs,
  limit: number = 20,
): Promise<MarketplaceListResponse> {
  // Backwards-compatible signature : the legacy form
  // `fetchMarketplaceProducts(cursor, limit)` still works ; new callers
  // can pass an args object with country / q / category / sort.
  let cursor: string | null | undefined;
  let effectiveLimit = limit;
  let country: string | null | undefined;
  let q: string | null | undefined;
  let category: string | null | undefined;
  let sort: string | null | undefined;
  if (
    cursorOrArgs !== null &&
    typeof cursorOrArgs === "object" &&
    !Array.isArray(cursorOrArgs)
  ) {
    cursor = cursorOrArgs.cursor;
    effectiveLimit = cursorOrArgs.limit ?? limit;
    country = cursorOrArgs.country;
    q = cursorOrArgs.q;
    category = cursorOrArgs.category;
    sort = cursorOrArgs.sort;
  } else {
    cursor = cursorOrArgs as string | null | undefined;
  }

  const params = new URLSearchParams();
  params.set("limit", String(effectiveLimit));
  // URLSearchParams encodes `+` as `%2B`, which the backend round-trips
  // correctly even for ISO datetimes containing `+HH:MM` tz offsets
  // (Étape 7.1 defensive parse). Never string-concat the cursor.
  if (cursor) params.set("after", cursor);
  if (country && country !== "all") params.set("country", country);
  if (q && q.trim().length > 0) params.set("q", q.trim());
  if (category && category !== "all") params.set("category", category);
  // Only set sort when caller explicitly passed a non-default — keeps
  // the URL query string clean for the common newest case (cleaner
  // shareable links + a trivial cache-key win).
  if (sort && sort !== "newest") params.set("sort", sort);
  const res = await fetchApi(`/marketplace/products?${params.toString()}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`Marketplace fetch failed: ${res.status}`);
  }
  return (await res.json()) as MarketplaceListResponse;
}

// Curated discovery rails (editorial merchandising). Typed manually
// until `pnpm gen:api` re-runs against the live backend — the endpoint
// is new so api.gen.ts doesn't carry it yet.
export interface MarketplaceSection {
  key: string;
  title: string;
  products: MarketplaceProductItem[];
}

export interface MarketplaceSectionsResponse {
  sections: MarketplaceSection[];
}

export async function fetchMarketplaceSections(
  country?: string | null,
): Promise<MarketplaceSectionsResponse> {
  const params = new URLSearchParams();
  if (country && country !== "all") params.set("country", country);
  const qs = params.toString();
  const res = await fetchApi(
    `/marketplace/sections${qs ? `?${qs}` : ""}`,
    { next: { revalidate: 60 } },
  );
  if (!res.ok) {
    throw new Error(`Marketplace sections fetch failed: ${res.status}`);
  }
  return (await res.json()) as MarketplaceSectionsResponse;
}

export async function fetchFeaturedSellers(
  limit: number = 6,
): Promise<FeaturedSeller[]> {
  // Fetch 3× products to ensure dedup yields enough distinct sellers.
  const data = await fetchMarketplaceProducts(null, limit * 3);
  const sellers = new Map<string, FeaturedSeller>();
  for (const p of data.products) {
    if (!sellers.has(p.seller_handle)) {
      sellers.set(p.seller_handle, {
        handle: p.seller_handle,
        shop_name: p.seller_shop_name,
        country: p.seller_country ?? null,
        primary_image_url: p.primary_image_url ?? null,
      });
    }
    if (sellers.size >= limit) break;
  }
  return Array.from(sellers.values());
}

// J10-V5 Phase 5 polish residual Item 1 — `displayUsdt` (Decimal-string
// signature) moved to lib/usdt.ts as `displayUsdtFromDecimalString`.
// The lib/usdt.ts module is now the canonical home for all 4 USDT
// formatters (eliminates the previous name collision with
// lib/usdt.ts:displayUsdt which had a bigint signature).
