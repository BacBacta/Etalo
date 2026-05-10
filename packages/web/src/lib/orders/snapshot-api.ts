/**
 * Order delivery snapshot API — Sprint J11.7 Block 7 (ADR-044) +
 * ADR-050 (V1 inline checkout pivot).
 *
 * Wraps PATCH /api/v1/orders/by-onchain-id/{id}/delivery-address[-inline]
 * with indexer-race retry logic. The on-chain order is created by the
 * buyer's wallet, the indexer picks up the OrderCreated event, then
 * writes the Order row. There can be a few-second window between the
 * fund tx confirmation and the indexer catchup ; the frontend retries
 * on 404 with exponential backoff so the snapshot persists once the
 * row lands.
 *
 * Two endpoints, one shared retry loop :
 * - `/delivery-address` (J11.7) — references an address-book entry by
 *   address_id. Kept for backwards compat with cached J11.7 frontends.
 * - `/delivery-address-inline` (ADR-050) — full snapshot JSON, no
 *   address-book row created. The V1 default since the inline-checkout
 *   pivot.
 */
import { fetchApi } from "@/lib/fetch-api";

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1_500;

export interface SetSnapshotArgs {
  walletAddress: string;
  onchainOrderId: bigint;
  addressId: string;
}

export interface SetSnapshotInlineArgs {
  walletAddress: string;
  onchainOrderId: bigint;
  recipient_name: string;
  phone_number: string;
  country: string;
  region: string;
  city: string;
  area: string;
  address_line: string;
  landmark?: string | null;
  notes?: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function patchSnapshot(
  path: string,
  walletAddress: string,
  body: Record<string, unknown>,
): Promise<void> {
  let attempt = 0;
  let delay = INITIAL_DELAY_MS;
  let lastErr: Error | undefined;

  while (attempt < MAX_RETRIES) {
    const res = await fetchApi(path, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Wallet-Address": walletAddress,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      return;
    }

    if (res.status === 404) {
      // Indexer race — wait and retry.
      lastErr = new Error("Order not yet indexed (404)");
      attempt += 1;
      if (attempt < MAX_RETRIES) {
        await sleep(delay);
        delay *= 2;
      }
      continue;
    }

    // Non-retriable error.
    const errBody = (await res.json().catch(() => ({}))) as {
      detail?: string;
    };
    throw new Error(
      errBody.detail ?? `Snapshot failed with status ${res.status}`,
    );
  }

  throw lastErr ?? new Error("Snapshot retries exhausted");
}

/**
 * Snapshot the buyer's address into the order via the J11.7 address-
 * book reference variant. Retries on 404 (indexer race) ; surfaces
 * other errors immediately. Caller should treat failure as best-effort
 * and not block UX (the buyer can still re-set the snapshot from the
 * order detail page later if it didn't land).
 *
 * @deprecated by ADR-050 — new checkouts use
 * `setOrderDeliverySnapshotInline` instead. Kept for backwards compat.
 */
export async function setOrderDeliverySnapshot(
  args: SetSnapshotArgs,
): Promise<void> {
  const path = `/orders/by-onchain-id/${args.onchainOrderId.toString()}/delivery-address`;
  await patchSnapshot(path, args.walletAddress, {
    address_id: args.addressId,
  });
}

/**
 * Snapshot the buyer's inline-typed address directly into the order
 * (ADR-050). Same retry/error semantics as the J11.7 variant. Used by
 * the checkout flow when the buyer fills the InlineDeliveryAddressForm
 * instead of picking from a saved address-book.
 */
export async function setOrderDeliverySnapshotInline(
  args: SetSnapshotInlineArgs,
): Promise<void> {
  const {
    walletAddress,
    onchainOrderId,
    recipient_name,
    phone_number,
    country,
    region,
    city,
    area,
    address_line,
    landmark,
    notes,
  } = args;
  const path = `/orders/by-onchain-id/${onchainOrderId.toString()}/delivery-address-inline`;
  await patchSnapshot(path, walletAddress, {
    recipient_name,
    phone_number,
    country,
    region,
    city,
    area,
    address_line,
    ...(landmark ? { landmark } : {}),
    ...(notes ? { notes } : {}),
  });
}
