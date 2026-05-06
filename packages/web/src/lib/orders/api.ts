/**
 * Buyer-side orders API — J11.5 Block 3.B.
 *
 * Reads against the V2 indexer-populated DB via FastAPI :
 *   GET /orders?buyer=<addr>&limit=N&offset=M  (list)
 *   GET /orders/{order_id}?caller=<addr>       (detail, ADR-043 casual filter)
 *
 * Privacy posture for detail (ADR-043) :
 * - `caller` is OPTIONAL — endpoint reads publicly without it
 * - When provided, returns 404 if caller ∉ {buyer, seller}
 * - "Casual privacy" only ; on-chain attackers can already reconstruct
 *   order history from `EtaloEscrow` events. SIWE / real session auth
 *   is NOT viable in the MiniPay context (FU-J11-005).
 */
import { fetchApi } from "@/lib/fetch-api";
import type { OrderListResponse, OrderResponse } from "@/lib/orders/state";

export interface BuyerOrdersListArgs {
  buyer: string;
  limit?: number;
  offset?: number;
}

export const BUYER_ORDERS_DEFAULT_LIMIT = 20;

export async function fetchBuyerOrders(
  args: BuyerOrdersListArgs,
): Promise<OrderListResponse> {
  const { buyer, limit = BUYER_ORDERS_DEFAULT_LIMIT, offset = 0 } = args;
  const params = new URLSearchParams();
  params.set("buyer", buyer);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const res = await fetchApi(`/orders?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Buyer orders fetch failed: ${res.status}`);
  }
  return (await res.json()) as OrderListResponse;
}

export interface BuyerOrderDetailArgs {
  orderId: string;
  /** Wallet address asserted by the caller for ADR-043 casual filter.
   *  Optional ; when omitted the endpoint stays publicly readable for
   *  V1 backwards compat with non-buyer surfaces. */
  caller?: string;
}

export async function fetchBuyerOrderDetail(
  args: BuyerOrderDetailArgs,
): Promise<OrderResponse> {
  const { orderId, caller } = args;
  const params = new URLSearchParams();
  if (caller) params.set("caller", caller);
  const qs = params.toString();
  const path = qs ? `/orders/${orderId}?${qs}` : `/orders/${orderId}`;

  const res = await fetchApi(path);
  if (res.status === 404) {
    // Surfaced as "not found" in UI — the response shape MUST be
    // identical for "doesn't exist" and "exists but caller mismatch"
    // per ADR-043 (no enumeration leak). Caller of this fn cannot tell
    // them apart, by design.
    throw new BuyerOrderNotFoundError(orderId);
  }
  if (!res.ok) {
    throw new Error(`Buyer order detail fetch failed: ${res.status}`);
  }
  return (await res.json()) as OrderResponse;
}

export class BuyerOrderNotFoundError extends Error {
  readonly orderId: string;
  constructor(orderId: string) {
    super(`Order ${orderId} not found or you do not have permission to view it`);
    this.name = "BuyerOrderNotFoundError";
    this.orderId = orderId;
  }
}
