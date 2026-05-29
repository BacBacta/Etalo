/**
 * Vitest specs for finalizeCart() — the post-fund hook that stamps
 * Order.product_ids and decrements Product.stock on the backend.
 *
 * Covers :
 *  - URL + method + JSON body shape
 *  - Pass-through of the three status values returned by the backend
 *    (finalized / already_finalized / indexer_pending)
 *  - 202 response is treated as success (indexer_pending)
 *  - Non-2xx (other than 202) throws so the caller's try/catch can warn
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { finalizeCart } from "@/lib/checkout";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finalizeCart", () => {
  it("POSTs JSON body to /cart/finalize with bigint orderId coerced to number", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "finalized" }), { status: 200 }),
    );

    const status = await finalizeCart({
      token: "abc.def",
      onchainOrderId: 42n,
      sellerHandle: "atelier-mia",
    });

    expect(status).toBe("finalized");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/cart\/finalize$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      token: "abc.def",
      onchain_order_id: 42,
      seller_handle: "atelier-mia",
    });
  });

  it("returns 'already_finalized' status verbatim", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "already_finalized" }), {
        status: 200,
      }),
    );

    const status = await finalizeCart({
      token: "abc.def",
      onchainOrderId: 1,
      sellerHandle: "shop",
    });
    expect(status).toBe("already_finalized");
  });

  it("treats 202 as success and returns 'indexer_pending'", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "indexer_pending" }), {
        status: 202,
      }),
    );

    const status = await finalizeCart({
      token: "abc.def",
      onchainOrderId: 1,
      sellerHandle: "shop",
    });
    expect(status).toBe("indexer_pending");
  });

  it("throws on non-2xx/202 (e.g. 401 invalid token)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Invalid cart token" }), {
        status: 401,
      }),
    );

    await expect(
      finalizeCart({
        token: "bogus",
        onchainOrderId: 1,
        sellerHandle: "shop",
      }),
    ).rejects.toThrow(/Cart finalize failed: 401/);
  });
});
