/**
 * Vitest specs for lib/sellerOrderHelpers — fix/seller-orders-delivery-info.
 *
 * Covers : privacy buyer label, deadline countdown urgency tiers,
 * status badge mapping, IPFS gateway helper, pick-list aggregation
 * (qty rollup + earliest-deadline pick + sort order), and the orders
 * summary banner aggregate.
 */
import { describe, expect, it } from "vitest";

import {
  aggregateOpenOrdersBySku,
  buyerLabel,
  deadlineInfo,
  formatDuration,
  ipfsImageUrl,
  isShippable,
  SELLER_INACTIVITY_WINDOW_MS,
  statusBadgeClass,
  summarizeOrders,
} from "@/lib/sellerOrderHelpers";

describe("buyerLabel", () => {
  it("returns city + country (humanized) when snapshot is populated", () => {
    expect(
      buyerLabel(
        {
          city: "Lagos",
          country: "NGA",
        },
        42,
      ),
    ).toBe("Buyer in Lagos, Nigeria");
  });

  it("falls back to country only when city is missing", () => {
    expect(buyerLabel({ country: "GHA" }, 7)).toBe("Buyer in Ghana");
  });

  it("falls back to city only when country is missing", () => {
    expect(buyerLabel({ city: "Accra" }, 7)).toBe("Buyer in Accra");
  });

  it("falls back to Order #N when snapshot is null (rule 5 — never 0x…)", () => {
    expect(buyerLabel(null, 99)).toBe("Order #99");
  });

  it("falls back to Order #N when snapshot has neither city nor country", () => {
    expect(buyerLabel({ phone_number: "+2349011234567" }, 7)).toBe("Order #7");
  });
});

describe("deadlineInfo", () => {
  const FUNDED = "2026-05-01T10:00:00Z";

  it("returns null when funded_at is missing", () => {
    expect(deadlineInfo(null, "Funded")).toBeNull();
  });

  it("returns null when status is not shippable (Created / Completed / etc.)", () => {
    expect(deadlineInfo(FUNDED, "Created")).toBeNull();
    expect(deadlineInfo(FUNDED, "Completed")).toBeNull();
    expect(deadlineInfo(FUNDED, "Refunded")).toBeNull();
  });

  it("flags 'safe' when more than 3 days remain", () => {
    const now = new Date("2026-05-02T10:00:00Z"); // 1 day after fund
    const dl = deadlineInfo(FUNDED, "Funded", now);
    expect(dl).not.toBeNull();
    expect(dl!.urgency).toBe("safe");
    // 7d window − 1d elapsed = 6d remaining.
    expect(dl!.label).toMatch(/^6d/);
  });

  it("flags 'warn' inside the 3-day window", () => {
    const now = new Date("2026-05-06T10:00:00Z"); // 5 days after fund
    const dl = deadlineInfo(FUNDED, "Funded", now);
    expect(dl!.urgency).toBe("warn");
    // 7d − 5d = 2d remaining.
    expect(dl!.label).toMatch(/^2d/);
  });

  it("flags 'urgent' inside the last 24h", () => {
    const now = new Date("2026-05-08T05:00:00Z"); // 6d 19h after fund
    const dl = deadlineInfo(FUNDED, "Funded", now);
    expect(dl!.urgency).toBe("urgent");
  });

  it("flags 'expired' once past the 7-day window", () => {
    const now = new Date("2026-05-10T10:00:00Z"); // 9 days after fund
    const dl = deadlineInfo(FUNDED, "Funded", now);
    expect(dl!.urgency).toBe("expired");
    expect(dl!.msRemaining).toBeLessThan(0);
    expect(dl!.label).toBe("expired");
  });

  it("uses the same 7-day window for PartiallyShipped (still seller-action-required)", () => {
    const now = new Date("2026-05-04T10:00:00Z"); // 3 days after fund
    const dl = deadlineInfo(FUNDED, "PartiallyShipped", now);
    expect(dl).not.toBeNull();
    expect(dl!.msRemaining).toBeGreaterThan(0);
    expect(dl!.msRemaining).toBeLessThanOrEqual(SELLER_INACTIVITY_WINDOW_MS);
  });
});

describe("formatDuration", () => {
  it("renders hours+minutes when under one day", () => {
    expect(formatDuration(2 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe("2h 30m");
  });

  it("renders minutes only when under one hour", () => {
    expect(formatDuration(20 * 60 * 1000)).toBe("20m");
  });

  it("renders days+hours when over one day", () => {
    expect(formatDuration(3 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000)).toBe(
      "3d 4h",
    );
  });

  it("returns 'expired' for zero / negative ms", () => {
    expect(formatDuration(0)).toBe("expired");
    expect(formatDuration(-1000)).toBe("expired");
  });
});

describe("isShippable", () => {
  it("includes Funded + PartiallyShipped only", () => {
    expect(isShippable("Funded")).toBe(true);
    expect(isShippable("PartiallyShipped")).toBe(true);
    expect(isShippable("Created")).toBe(false);
    expect(isShippable("AllShipped")).toBe(false);
    expect(isShippable("Completed")).toBe(false);
  });
});

describe("statusBadgeClass", () => {
  it("maps shippable statuses to amber", () => {
    expect(statusBadgeClass("Funded")).toContain("amber");
    expect(statusBadgeClass("PartiallyShipped")).toContain("amber");
  });

  it("maps disputed to rose, completed to emerald", () => {
    expect(statusBadgeClass("Disputed")).toContain("rose");
    expect(statusBadgeClass("Completed")).toContain("emerald");
  });

  it("falls back to neutral for unknown statuses", () => {
    expect(statusBadgeClass("WhateverUnknown")).toContain("neutral");
  });
});

describe("ipfsImageUrl", () => {
  it("returns null when hash is null/undefined/empty", () => {
    expect(ipfsImageUrl(null)).toBeNull();
    expect(ipfsImageUrl(undefined)).toBeNull();
    expect(ipfsImageUrl("")).toBeNull();
  });

  it("prepends the Pinata gateway when hash is present", () => {
    expect(ipfsImageUrl("QmAbc")).toBe(
      "https://gateway.pinata.cloud/ipfs/QmAbc",
    );
  });
});

describe("aggregateOpenOrdersBySku", () => {
  const NOW = new Date("2026-05-02T10:00:00Z");

  it("rolls up duplicate SKU titles across orders, preserving first-image", () => {
    const skus = aggregateOpenOrdersBySku(
      [
        {
          onchain_order_id: 1,
          global_status: "Funded",
          funded_at: "2026-05-01T10:00:00Z",
          line_items: [
            { title: "Robe wax M", qty: 2, image_ipfs_hash: "QmRobe" },
          ],
        },
        {
          onchain_order_id: 2,
          global_status: "Funded",
          funded_at: "2026-05-01T11:00:00Z",
          line_items: [
            { title: "Robe wax M", qty: 1, image_ipfs_hash: "QmRobe" },
            { title: "Sandales 38", qty: 1, image_ipfs_hash: null },
          ],
        },
      ],
      NOW,
    );
    const robe = skus.find((s) => s.title === "Robe wax M");
    expect(robe).toBeDefined();
    expect(robe!.totalQty).toBe(3);
    expect(robe!.orderCount).toBe(2);
    expect(robe!.contributingOrderIds).toEqual([1, 2]);
    expect(robe!.imageHash).toBe("QmRobe");
  });

  it("excludes non-shippable orders (Created / Completed / Disputed)", () => {
    const skus = aggregateOpenOrdersBySku(
      [
        {
          onchain_order_id: 1,
          global_status: "Created",
          funded_at: null,
          line_items: [{ title: "X", qty: 1 }],
        },
        {
          onchain_order_id: 2,
          global_status: "Completed",
          funded_at: "2026-05-01T10:00:00Z",
          line_items: [{ title: "Y", qty: 5 }],
        },
        {
          onchain_order_id: 3,
          global_status: "Funded",
          funded_at: "2026-05-01T10:00:00Z",
          line_items: [{ title: "Z", qty: 2 }],
        },
      ],
      NOW,
    );
    expect(skus).toHaveLength(1);
    expect(skus[0].title).toBe("Z");
  });

  it("sorts by earliest deadline, then by qty desc", () => {
    const skus = aggregateOpenOrdersBySku(
      [
        {
          onchain_order_id: 1,
          global_status: "Funded",
          funded_at: "2026-04-26T10:00:00Z", // 6 days ago — urgent
          line_items: [{ title: "Urgent SKU", qty: 1 }],
        },
        {
          onchain_order_id: 2,
          global_status: "Funded",
          funded_at: "2026-05-01T10:00:00Z", // 1 day ago — safe
          line_items: [{ title: "Safe SKU", qty: 10 }],
        },
      ],
      NOW,
    );
    expect(skus[0].title).toBe("Urgent SKU");
    expect(skus[1].title).toBe("Safe SKU");
  });
});

describe("summarizeOrders", () => {
  const NOW = new Date("2026-05-02T10:00:00Z");

  it("counts only shippable orders and sums their item qty", () => {
    const summary = summarizeOrders(
      [
        {
          onchain_order_id: 1,
          global_status: "Funded",
          funded_at: "2026-05-01T10:00:00Z",
          line_items: [{ title: "A", qty: 2 }, { title: "B", qty: 1 }],
        },
        {
          onchain_order_id: 2,
          global_status: "Created",
          funded_at: null,
          line_items: [{ title: "C", qty: 5 }], // excluded — pre-fund
        },
      ],
      NOW,
    );
    expect(summary.shippableOrderCount).toBe(1);
    expect(summary.totalItemsToShip).toBe(3);
    expect(summary.earliestDeadline).not.toBeNull();
  });

  it("returns null earliestDeadline when no shippable orders", () => {
    const summary = summarizeOrders(
      [
        {
          onchain_order_id: 1,
          global_status: "Completed",
          funded_at: "2026-05-01T10:00:00Z",
          line_items: [{ title: "A", qty: 2 }],
        },
      ],
      NOW,
    );
    expect(summary.shippableOrderCount).toBe(0);
    expect(summary.earliestDeadline).toBeNull();
  });
});
