import { fetchApi } from "@/lib/fetch-api";
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

export async function postCartToken(
  items: Array<{ productId: string; qty: number }>,
): Promise<CartTokenResponse> {
  const res = await fetchApi("/cart/checkout-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map((i) => ({ product_id: i.productId, qty: i.qty })),
    }),
  });
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
