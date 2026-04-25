import type { WalletClient } from "viem";

import { signApiRequest, type HttpMethod } from "@/lib/eip191";
import type { paths } from "@/types/api.gen";

// API_URL contains the /api/v1 prefix already (e.g. http://localhost:8000/api/v1).
// API_PREFIX is the path-only form used to build the EIP-191-signed canonical
// path (must match the FastAPI route path on the server).
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const API_PREFIX = "/api/v1";

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

export type MarketplaceProductItem = MarketplaceListResponse["products"][number];

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

export interface Eip191AuthOptions {
  walletClient: WalletClient;
  method: HttpMethod;
}

type ApiOptions = RequestInit & {
  wallet?: string;
  eip191?: Eip191AuthOptions;
};

// Generic authenticated/unauthenticated fetch wrapper for backend mutations.
// V2 EIP-191 auth path (deprecated by ADR-034 but in use until on-chain event
// migration); legacy `wallet` X-Wallet-Address dev shortcut.
export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { wallet, eip191, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  const isFormData = rest.body instanceof FormData;
  if (!finalHeaders.has("Content-Type") && rest.body && !isFormData) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (wallet) {
    finalHeaders.set("X-Wallet-Address", wallet);
  }
  if (eip191) {
    const signedPath = `${API_PREFIX}${path}`;
    const sig = await signApiRequest(
      eip191.walletClient,
      eip191.method,
      signedPath,
    );
    finalHeaders.set("X-Etalo-Signature", sig["X-Etalo-Signature"]);
    finalHeaders.set("X-Etalo-Timestamp", sig["X-Etalo-Timestamp"]);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
  });

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
  const res = await fetch(
    `${API_URL}/products/public/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`,
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
  const url = new URL(
    `${API_URL}/products/public/${encodeURIComponent(handle)}`,
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));

  const res = await fetch(url.toString(), {
    next: { revalidate: 30 },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Boutique fetch failed: ${res.status}`);
  }
  return (await res.json()) as BoutiquePublic;
}

export async function fetchMarketplaceProducts(
  cursor?: string | null,
  limit: number = 20,
): Promise<MarketplaceListResponse> {
  const url = new URL(`${API_URL}/marketplace/products`);
  url.searchParams.set("limit", String(limit));
  // URLSearchParams encodes `+` as `%2B`, which the backend round-trips
  // correctly even for ISO datetimes containing `+HH:MM` tz offsets
  // (Étape 7.1 defensive parse). Never string-concat the cursor.
  if (cursor) url.searchParams.set("after", cursor);

  const res = await fetch(url.toString(), {
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`Marketplace fetch failed: ${res.status}`);
  }
  return (await res.json()) as MarketplaceListResponse;
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

export function displayUsdt(decimalString: string): string {
  const n = Number(decimalString);
  if (Number.isNaN(n)) return `${decimalString} USDT`;
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDT`;
}
