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
 */
import type { paths, components } from "@/types/api.gen";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export type SellerProfilePublic = components["schemas"]["SellerProfilePublic"];
export type SellersMeResponse = components["schemas"]["SellersMeResponse"];
export type SellerProfileResponse =
  components["schemas"]["SellerProfileResponse"];
export type StakeBlock = components["schemas"]["StakeBlock"];
export type StakeTier = components["schemas"]["StakeTier"];
export type SellerOrdersPage = components["schemas"]["SellerOrdersPage"];
export type SellerOrderItem = components["schemas"]["SellerOrderItem"];
export type SellerProfileUpdate =
  components["schemas"]["SellerProfileUpdate"];
export type ProductDetail = components["schemas"]["ProductDetail"];
export type ProductCreate = NonNullable<
  paths["/api/v1/products"]["post"]["requestBody"]
>["content"]["application/json"];
export type ProductUpdate = NonNullable<
  paths["/api/v1/products/{product_id}"]["put"]["requestBody"]
>["content"]["application/json"];

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
  const res = await fetch(`${API_URL}/sellers/me`, {
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
  const res = await fetch(
    `${API_URL}/sellers/${encodeURIComponent(address)}/profile`,
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
  const url = new URL(
    `${API_URL}/sellers/${encodeURIComponent(address)}/orders`,
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));
  // Note: OrderStatus enum is title-case ("Completed", "Funded", …).
  if (orderStatus) url.searchParams.set("order_status", orderStatus);

  const res = await fetch(url.toString());
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
  const res = await fetch(`${API_URL}/sellers/me/profile`, {
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

// Convert raw 6-decimal USDT amount (BigInteger storage, e.g. 12_990_000)
// into a "12.99" display string. The backend's SellerOrderItem returns
// total_amount_usdt as a number — safe up to 9_007 USD because of JS
// Number.MAX_SAFE_INTEGER, fine for V1 caps (MAX_ORDER = 500 USDT).
export function formatRawUsdt(rawAmount: number): string {
  return (rawAmount / 1_000_000).toFixed(2);
}
