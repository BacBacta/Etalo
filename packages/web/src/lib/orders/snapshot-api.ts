/**
 * Order delivery snapshot API — Sprint J11.7 Block 7 (ADR-044).
 *
 * Wraps PATCH /api/v1/orders/by-onchain-id/{id}/delivery-address with
 * indexer-race retry logic. The on-chain order is created by the
 * buyer's wallet, the indexer picks up the OrderCreated event, then
 * writes the Order row. There can be a few-second window between the
 * fund tx confirmation and the indexer catchup ; the frontend retries
 * on 404 with exponential backoff so the snapshot persists once the
 * row lands.
 */
import { fetchApi } from "@/lib/fetch-api";

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1_500;

export interface SetSnapshotArgs {
  walletAddress: string;
  onchainOrderId: bigint;
  addressId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Snapshot the buyer's address into the order. Retries on 404 (indexer
 * race) ; surfaces other errors immediately. Caller should treat
 * failure as best-effort and not block UX (the buyer can still re-set
 * the snapshot from the order detail page later if it didn't land).
 */
export async function setOrderDeliverySnapshot(
  args: SetSnapshotArgs,
): Promise<void> {
  const { walletAddress, onchainOrderId, addressId } = args;
  const path = `/orders/by-onchain-id/${onchainOrderId.toString()}/delivery-address`;

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
      body: JSON.stringify({ address_id: addressId }),
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
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(
      body.detail ?? `Snapshot failed with status ${res.status}`,
    );
  }

  // Exhausted retries.
  throw lastErr ?? new Error("Snapshot retries exhausted");
}
