import { fetchApi } from "@/lib/fetch-api";
import { ORDERS_FROZEN, ORDERS_FROZEN_MESSAGE } from "@/lib/flags";
import type { paths } from "@/types/api.gen";

export type CartTokenResponse =
  paths["/api/v1/cart/checkout-token"]["post"]["responses"]["200"]["content"]["application/json"];
export type ResolvedCart =
  paths["/api/v1/cart/resolve/{token}"]["get"]["responses"]["200"]["content"]["application/json"];

export interface CartValidationItemError {
  product_id: string;
  reason: string;
  available_qty?: number | null;
}

export class CartValidationError extends Error {
  errors: CartValidationItemError[];
  constructor(errors: CartValidationItemError[]) {
    super("Cart validation failed");
    this.name = "CartValidationError";
    this.errors = errors;
  }
}

export class CartTokenExpiredError extends Error {
  constructor() {
    super("Cart token expired");
    this.name = "CartTokenExpiredError";
  }
}

export class CartTokenInvalidError extends Error {
  constructor() {
    super("Invalid cart token");
    this.name = "CartTokenInvalidError";
  }
}

/** ADR-057 Phase 0 — thrown when the backend has frozen new-order intake
 *  for the escrow migration (503 on /cart/checkout-token), or when the
 *  client-side ORDERS_FROZEN flag short-circuits before the request.
 *  Callers should surface `ORDERS_FROZEN_MESSAGE`, not a generic error. */
export class OrdersFrozenError extends Error {
  constructor() {
    super(ORDERS_FROZEN_MESSAGE);
    this.name = "OrdersFrozenError";
  }
}

export async function postCartToken(
  items: Array<{ productId: string; qty: number }>,
): Promise<CartTokenResponse> {
  // Proactive client gate — avoid a doomed round-trip when the build
  // flag is set. The backend 503 below is the authoritative gate.
  if (ORDERS_FROZEN) {
    throw new OrdersFrozenError();
  }
  const res = await fetchApi("/cart/checkout-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map((i) => ({ product_id: i.productId, qty: i.qty })),
    }),
  });
  if (res.status === 503) {
    // Backend intake freeze (ADR-057 Phase 0) — source of truth, works
    // even if the client build flag is off.
    throw new OrdersFrozenError();
  }
  if (res.status === 422) {
    const detail = (await res.json()) as {
      detail: { validation_errors: CartValidationItemError[] };
    };
    throw new CartValidationError(detail.detail.validation_errors);
  }
  if (!res.ok) {
    throw new Error(`Cart token creation failed: ${res.status}`);
  }
  return (await res.json()) as CartTokenResponse;
}

export async function resolveCartToken(token: string): Promise<ResolvedCart> {
  const res = await fetchApi(
    `/cart/resolve/${encodeURIComponent(token)}`,
  );
  if (res.status === 410) throw new CartTokenExpiredError();
  if (res.status === 401) throw new CartTokenInvalidError();
  if (!res.ok) {
    throw new Error(`Cart resolve failed: ${res.status}`);
  }
  return (await res.json()) as ResolvedCart;
}

export type FinalizeStatus = "finalized" | "already_finalized" | "indexer_pending";

export async function finalizeCart(params: {
  token: string;
  onchainOrderId: number | bigint;
  sellerHandle: string;
}): Promise<FinalizeStatus> {
  const res = await fetchApi("/cart/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: params.token,
      onchain_order_id: Number(params.onchainOrderId),
      seller_handle: params.sellerHandle,
    }),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`Cart finalize failed: ${res.status}`);
  }
  const body = (await res.json()) as { status: FinalizeStatus };
  return body.status;
}
