/**
 * Vitest specs for the ADR-057 Phase 0 intake-freeze handling in
 * postCartToken — the backend 503 is the source of truth and must
 * surface as a typed OrdersFrozenError (not a generic failure).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CartValidationError,
  OrdersFrozenError,
  postCartToken,
} from "@/lib/checkout";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ITEMS = [{ productId: "p1", qty: 1 }];

describe("postCartToken — orders frozen (ADR-057 Phase 0)", () => {
  it("throws OrdersFrozenError on a 503 from the backend gate", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ detail: { reason: "orders_frozen" } }),
        { status: 503 },
      ),
    );
    await expect(postCartToken(ITEMS)).rejects.toBeInstanceOf(
      OrdersFrozenError,
    );
  });

  it("still throws CartValidationError on 422 (freeze path didn't swallow it)", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            validation_errors: [{ product_id: "p1", reason: "qty_exceeds_stock" }],
          },
        }),
        { status: 422 },
      ),
    );
    await expect(postCartToken(ITEMS)).rejects.toBeInstanceOf(
      CartValidationError,
    );
  });

  it("returns the token normally on 200 (no false freeze)", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ token: "abc.def", expires_at: "2026-06-03T13:00:00Z" }),
        { status: 200 },
      ),
    );
    const res = await postCartToken(ITEMS);
    expect(res.token).toBe("abc.def");
  });
});
