/**
 * Seller dashboard API client (J6 Block 8 Étape 8.2).
 *
 * Two read shapes are stitched together in the dashboard:
 *  - `/sellers/me` (X-Wallet-Address auth)        → SellerProfilePublic
 *    Identity bits: shop_handle, shop_name, description, logo, socials.
 *  - `/sellers/{address}/profile` (public)        → SellerProfileResponse
 *    On-chain bits: stake (tier+amount), reputation, recent_orders_count.
 *
 * Mutations send X-Wallet-Address per ADR-036 (no signed message — see
 * ADR-034). Frontend gating + MiniPay WebView trust model do the heavy
 * lifting upstream.
 *
 * All requests go through fetchApi / fetchApiFormData which auto-inject
 * the `ngrok-skip-browser-warning` header for ngrok-tunnelled testing.
 */
import { fetchApi, fetchApiFormData } from "@/lib/fetch-api";
import type { components } from "@/types/api.gen";

// J11.7 Block 4 — `country` was added to SellerProfilePublic and
// SellerProfileUpdate at the backend (ADR-045 country edit support).
// The api.gen.ts file is auto-regenerated from the running backend's
// OpenAPI spec via `pnpm gen:api`; until it's re-run post-Block 4 merge,
// we extend the generated types locally so ProfileTab can pass `country`
// through. The extensions are forward-compatible : once gen:api re-runs
// they become no-op intersections.
export type SellerProfilePublic =
  components["schemas"]["SellerProfilePublic"] & { country?: string | null };
export type SellersMeResponse = Omit<
  components["schemas"]["SellersMeResponse"],
  "profile"
> & { profile: SellerProfilePublic | null };
export type SellerProfileResponse =
  components["schemas"]["SellerProfileResponse"];
export type StakeBlock = components["schemas"]["StakeBlock"];
export type StakeTier = components["schemas"]["StakeTier"];
export type SellerOrdersPage = components["schemas"]["SellerOrdersPage"];
export type SellerOrderItem = components["schemas"]["SellerOrderItem"];
export type SellerProfileUpdate =
  components["schemas"]["SellerProfileUpdate"] & { country?: string | null };
export type ProductDetail = components["schemas"]["ProductDetail"];
export type ProductCreate = components["schemas"]["ProductCreate"];
export type ProductUpdate = components["schemas"]["ProductUpdate"];
export type IpfsUploadResponse = components["schemas"]["IpfsUploadResponse"];
export type MyProductsListResponse =
  components["schemas"]["MyProductsListResponse"];
export type MyProductsListItem =
  components["schemas"]["MyProductsListItem"];

export class ProductSlugConflictError extends Error {
  constructor() {
    super("A product with this slug already exists.");
    this.name = "ProductSlugConflictError";
  }
}

export class SellerNotFoundError extends Error {
  constructor() {
    super("No seller profile for this wallet");
    this.name = "SellerNotFoundError";
  }
}

// === /sellers/me — owner identity (X-Wallet-Address required) ===
export async function fetchMyProfile(
  walletAddress: string,
): Promise<SellerProfilePublic | null> {
  const res = await fetchApi("/sellers/me", {
    headers: { "X-Wallet-Address": walletAddress },
  });
  if (!res.ok) {
    throw new Error(`Profile fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as SellersMeResponse;
  return data.profile ?? null;
}

// === /sellers/{address}/profile — on-chain summary (public) ===
export async function fetchSellerOnchainProfile(
  address: string,
): Promise<SellerProfileResponse> {
  const res = await fetchApi(
    `/sellers/${encodeURIComponent(address)}/profile`,
  );
  if (res.status === 404) throw new SellerNotFoundError();
  if (!res.ok) {
    throw new Error(`On-chain profile fetch failed: ${res.status}`);
  }
  return (await res.json()) as SellerProfileResponse;
}

// === /sellers/{address}/orders — public paginated read ===
export async function fetchSellerOrders(
  address: string,
  page: number = 1,
  pageSize: number = 20,
  orderStatus?: string,
): Promise<SellerOrdersPage> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  // Note: OrderStatus enum is title-case ("Completed", "Funded", …).
  if (orderStatus) params.set("order_status", orderStatus);
  const res = await fetchApi(
    `/sellers/${encodeURIComponent(address)}/orders?${params.toString()}`,
  );
  if (!res.ok) {
    throw new Error(`Orders fetch failed: ${res.status}`);
  }
  return (await res.json()) as SellerOrdersPage;
}

// === PUT /sellers/me/profile — owner mutation (ADR-036) ===
export async function updateSellerProfile(
  walletAddress: string,
  payload: SellerProfileUpdate,
): Promise<SellerProfilePublic> {
  const res = await fetchApi("/sellers/me/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Wallet-Address": walletAddress,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new Error("Wallet auth required");
  if (res.status === 404) throw new SellerNotFoundError();
  if (!res.ok) {
    throw new Error(`Profile update failed: ${res.status}`);
  }
  return (await res.json()) as SellerProfilePublic;
}

// J10-V5 Phase 5 polish residual Item 1 — `formatRawUsdt` moved to
// lib/usdt.ts as part of the consolidated USDT formatter API. Direct
// consumers (OrdersTab, OverviewTab) updated to import from lib/usdt.ts.

// === Product CRUD (ADR-036, X-Wallet-Address) ===
export async function createProduct(
  walletAddress: string,
  payload: ProductCreate,
): Promise<ProductDetail> {
  const res = await fetchApi("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wallet-Address": walletAddress,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) throw new ProductSlugConflictError();
  if (!res.ok) {
    throw new Error(`Product create failed: ${res.status}`);
  }
  return (await res.json()) as ProductDetail;
}

export async function updateProduct(
  walletAddress: string,
  productId: string,
  payload: ProductUpdate,
): Promise<ProductDetail> {
  const res = await fetchApi(
    `/products/${encodeURIComponent(productId)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Wallet-Address": walletAddress,
      },
      body: JSON.stringify(payload),
    },
  );
  if (res.status === 403) throw new Error("You do not own this product");
  if (res.status === 404) throw new Error("Product not found");
  if (!res.ok) {
    throw new Error(`Product update failed: ${res.status}`);
  }
  return (await res.json()) as ProductDetail;
}

export async function deleteProduct(
  walletAddress: string,
  productId: string,
): Promise<void> {
  const res = await fetchApi(
    `/products/${encodeURIComponent(productId)}`,
    {
      method: "DELETE",
      headers: { "X-Wallet-Address": walletAddress },
    },
  );
  if (res.status === 403) throw new Error("You do not own this product");
  if (res.status === 404) throw new Error("Product not found");
  if (!res.ok) {
    throw new Error(`Product delete failed: ${res.status}`);
  }
}

export async function uploadImage(
  walletAddress: string,
  file: File,
): Promise<IpfsUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetchApiFormData("/uploads/ipfs", formData, {
    headers: { "X-Wallet-Address": walletAddress },
  });
  if (res.status === 413) {
    throw new Error("Image too large (max 5MB)");
  }
  if (res.status === 415) {
    throw new Error("Invalid image type (JPEG, PNG, WebP only)");
  }
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
  return (await res.json()) as IpfsUploadResponse;
}

// Owner-side product list (Étape 8.4) — surfaces ALL statuses (incl.
// draft + paused). The public boutique listing filters status='active'.
export async function fetchMyProducts(
  walletAddress: string,
  includeDeleted: boolean = false,
): Promise<MyProductsListResponse> {
  const params = new URLSearchParams();
  if (includeDeleted) params.set("include_deleted", "true");
  const qs = params.toString();
  const path = qs ? `/sellers/me/products?${qs}` : "/sellers/me/products";
  const res = await fetchApi(path, {
    headers: { "X-Wallet-Address": walletAddress },
  });
  if (res.status === 401) throw new Error("Wallet auth required");
  if (res.status === 404) throw new SellerNotFoundError();
  if (!res.ok) {
    throw new Error(`Fetch my products failed: ${res.status}`);
  }
  return (await res.json()) as MyProductsListResponse;
}

// Reverse of `_ipfs_url` server-side: extract the hash trailing the
// gateway URL. Used to pre-fill the editor when the only access we have
// to a product is /products/public/{handle}/{slug} (which serves
// resolved gateway URLs, not raw hashes).
export function ipfsHashFromUrl(url: string): string | null {
  const match = url.match(/\/ipfs\/([^/?#]+)/);
  return match ? match[1] : null;
}
