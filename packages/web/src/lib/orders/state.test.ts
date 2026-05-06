/**
 * Unit tests for buyer order state derivation — J11.5 Block 3.
 *
 * Coverage strategy : exercise edge cases that the buyer interface
 * will hit in real V1 usage (empty items, partial state, time-bound
 * auto-release transitions). Time-dependent tests pin the clock with
 * `vi.useFakeTimers()` so they don't flake on slow CI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deriveAutoReleaseAt,
  deriveCompletedAt,
  deriveShippedAt,
  getEligibleActions,
  isOrderDisputed,
  type ItemStatus,
  type OrderItemResponse,
  type OrderResponse,
  type OrderStatus,
  type ShipmentGroupResponse,
  type ShipmentStatus,
} from "@/lib/orders/state";

// ============================================================
// Fixture factories — minimal valid OrderResponse / item / group
// ============================================================
const GROUP_ID_1 = "11111111-1111-1111-1111-111111111111";
const GROUP_ID_2 = "22222222-2222-2222-2222-222222222222";

function makeItem(overrides: Partial<OrderItemResponse> = {}): OrderItemResponse {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    onchain_item_id: 1,
    item_index: 0,
    item_price_usdt: 1_000_000,
    item_commission_usdt: 18_000,
    status: "Pending" as ItemStatus,
    shipment_group_id: null,
    released_amount_usdt: 0,
    item_price_human: "1.0",
    ...overrides,
  };
}

function makeGroup(
  overrides: Partial<ShipmentGroupResponse> = {},
): ShipmentGroupResponse {
  return {
    id: GROUP_ID_1,
    onchain_group_id: 1,
    status: "Pending" as ShipmentStatus,
    proof_hash: null,
    arrival_proof_hash: null,
    release_stage: 0,
    shipped_at: null,
    arrived_at: null,
    majority_release_at: null,
    final_release_after: null,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<OrderResponse> = {}): OrderResponse {
  return {
    id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    onchain_order_id: 9001,
    buyer_address: "0xcdba5ccf538b4088682d2f6408d2305edf4f096b",
    seller_address: "0xad7bbe9b75599d4703e3ca37350998f6c8d89596",
    seller_handle: "chioma_test_shop",
    total_amount_usdt: 1_000_000,
    total_commission_usdt: 18_000,
    is_cross_border: false,
    global_status: "Funded" as OrderStatus,
    item_count: 1,
    funded_at: "2026-05-01T12:00:00Z",
    created_at_chain: "2026-05-01T11:59:00Z",
    created_at_db: "2026-05-01T11:59:30Z",
    delivery_address: null,
    tracking_number: null,
    product_ids: null,
    notes: null,
    items: [makeItem()],
    shipment_groups: [],
    total_amount_human: "1.0",
    total_commission_human: "0.018",
    ...overrides,
  };
}

// ============================================================
// deriveAutoReleaseAt
// ============================================================
describe("deriveAutoReleaseAt", () => {
  it("returns null when there are no shipment groups", () => {
    const order = makeOrder({ shipment_groups: [] });
    expect(deriveAutoReleaseAt(order)).toBeNull();
  });

  it("returns null when groups have no majority_release_at set", () => {
    const order = makeOrder({ shipment_groups: [makeGroup()] });
    expect(deriveAutoReleaseAt(order)).toBeNull();
  });

  it("returns the timestamp when one group has majority_release_at", () => {
    const order = makeOrder({
      shipment_groups: [
        makeGroup({ majority_release_at: "2026-05-04T12:00:00Z" }),
      ],
    });
    const result = deriveAutoReleaseAt(order);
    expect(result?.toISOString()).toBe("2026-05-04T12:00:00.000Z");
  });

  it("returns the EARLIEST timestamp across multiple groups", () => {
    const order = makeOrder({
      shipment_groups: [
        makeGroup({ id: GROUP_ID_1, majority_release_at: "2026-05-08T00:00:00Z" }),
        makeGroup({ id: GROUP_ID_2, majority_release_at: "2026-05-04T00:00:00Z" }),
      ],
    });
    const result = deriveAutoReleaseAt(order);
    expect(result?.toISOString()).toBe("2026-05-04T00:00:00.000Z");
  });

  it("ignores groups with null majority_release_at when picking earliest", () => {
    const order = makeOrder({
      shipment_groups: [
        makeGroup({ id: GROUP_ID_1, majority_release_at: null }),
        makeGroup({ id: GROUP_ID_2, majority_release_at: "2026-05-04T00:00:00Z" }),
      ],
    });
    const result = deriveAutoReleaseAt(order);
    expect(result?.toISOString()).toBe("2026-05-04T00:00:00.000Z");
  });
});

// ============================================================
// isOrderDisputed
// ============================================================
describe("isOrderDisputed", () => {
  it("returns true when global_status is Disputed", () => {
    const order = makeOrder({ global_status: "Disputed" });
    expect(isOrderDisputed(order)).toBe(true);
  });

  it("returns true when at least one item has Disputed status", () => {
    const order = makeOrder({
      items: [makeItem({ status: "Released" }), makeItem({ status: "Disputed" })],
    });
    expect(isOrderDisputed(order)).toBe(true);
  });

  it("returns false when no item is disputed and global is not Disputed", () => {
    const order = makeOrder({
      global_status: "Funded",
      items: [makeItem({ status: "Pending" }), makeItem({ status: "Shipped" })],
    });
    expect(isOrderDisputed(order)).toBe(false);
  });

  it("returns false when items array is empty", () => {
    const order = makeOrder({ items: [], item_count: 0 });
    expect(isOrderDisputed(order)).toBe(false);
  });
});

// ============================================================
// deriveShippedAt
// ============================================================
describe("deriveShippedAt", () => {
  it("returns null when no group has shipped", () => {
    const order = makeOrder({ shipment_groups: [makeGroup()] });
    expect(deriveShippedAt(order)).toBeNull();
  });

  it("returns the earliest shipped_at across groups", () => {
    const order = makeOrder({
      shipment_groups: [
        makeGroup({ id: GROUP_ID_1, shipped_at: "2026-05-03T10:00:00Z" }),
        makeGroup({ id: GROUP_ID_2, shipped_at: "2026-05-02T10:00:00Z" }),
      ],
    });
    expect(deriveShippedAt(order)?.toISOString()).toBe(
      "2026-05-02T10:00:00.000Z",
    );
  });
});

// ============================================================
// deriveCompletedAt
// ============================================================
describe("deriveCompletedAt", () => {
  it("returns null when order is not Completed/Refunded", () => {
    const order = makeOrder({ global_status: "Funded" });
    expect(deriveCompletedAt(order)).toBeNull();
  });

  it("returns null when order is Completed but items not all terminal", () => {
    const order = makeOrder({
      global_status: "Completed",
      items: [makeItem({ status: "Released" }), makeItem({ status: "Shipped" })],
    });
    expect(deriveCompletedAt(order)).toBeNull();
  });

  it("returns latest final_release_after when all items terminal", () => {
    const order = makeOrder({
      global_status: "Completed",
      items: [makeItem({ status: "Released" })],
      shipment_groups: [
        makeGroup({ id: GROUP_ID_1, final_release_after: "2026-05-04T00:00:00Z" }),
        makeGroup({ id: GROUP_ID_2, final_release_after: "2026-05-05T00:00:00Z" }),
      ],
    });
    expect(deriveCompletedAt(order)?.toISOString()).toBe(
      "2026-05-05T00:00:00.000Z",
    );
  });

  it("handles Refunded status with all items Refunded", () => {
    const order = makeOrder({
      global_status: "Refunded",
      items: [makeItem({ status: "Refunded" })],
      shipment_groups: [
        makeGroup({ final_release_after: "2026-05-06T00:00:00Z" }),
      ],
    });
    expect(deriveCompletedAt(order)?.toISOString()).toBe(
      "2026-05-06T00:00:00.000Z",
    );
  });
});

// ============================================================
// getEligibleActions — buyer view (the main consumer)
// ============================================================
describe("getEligibleActions (buyer)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Created order : canCancel=true, no other action", () => {
    const order = makeOrder({ global_status: "Created" });
    const actions = getEligibleActions(order, "buyer");
    expect(actions.canCancel).toBe(true);
    expect(actions.canConfirmDelivery).toBe(false);
    expect(actions.canOpenDispute).toBe(false);
    expect(actions.canTriggerAutoRelease).toBe(false);
  });

  it("Funded order with Pending items : canOpenDispute=true, no confirm", () => {
    const order = makeOrder({
      global_status: "Funded",
      items: [makeItem({ status: "Pending" })],
    });
    const actions = getEligibleActions(order, "buyer");
    expect(actions.canOpenDispute).toBe(true);
    expect(actions.canConfirmDelivery).toBe(false);
    expect(actions.canCancel).toBe(false);
  });

  it("Item Shipped : canConfirmDelivery=true, canOpenDispute=true", () => {
    const order = makeOrder({
      global_status: "PartiallyShipped",
      items: [makeItem({ status: "Shipped" })],
    });
    const actions = getEligibleActions(order, "buyer");
    expect(actions.canConfirmDelivery).toBe(true);
    expect(actions.canOpenDispute).toBe(true);
  });

  it("Item Arrived : canConfirmDelivery=true", () => {
    const order = makeOrder({
      global_status: "AllShipped",
      items: [makeItem({ status: "Arrived" })],
    });
    expect(getEligibleActions(order, "buyer").canConfirmDelivery).toBe(true);
  });

  it("Completed order : all actions false", () => {
    const order = makeOrder({
      global_status: "Completed",
      items: [makeItem({ status: "Released" })],
    });
    const actions = getEligibleActions(order, "buyer");
    expect(actions.canConfirmDelivery).toBe(false);
    expect(actions.canOpenDispute).toBe(false);
    expect(actions.canCancel).toBe(false);
    expect(actions.canTriggerAutoRelease).toBe(false);
  });

  it("Cancelled order : all actions false", () => {
    const order = makeOrder({
      global_status: "Cancelled",
      items: [makeItem({ status: "Pending" })],
    });
    const actions = getEligibleActions(order, "buyer");
    expect(actions.canConfirmDelivery).toBe(false);
    expect(actions.canOpenDispute).toBe(false);
    expect(actions.canCancel).toBe(false);
  });

  it("All items Disputed : canOpenDispute=false (nothing left to dispute)", () => {
    const order = makeOrder({
      global_status: "Funded",
      items: [makeItem({ status: "Disputed" }), makeItem({ status: "Disputed" })],
    });
    expect(getEligibleActions(order, "buyer").canOpenDispute).toBe(false);
  });

  it("Partial dispute : canOpenDispute=true if at least one undisputed item", () => {
    const order = makeOrder({
      global_status: "PartiallyShipped",
      items: [makeItem({ status: "Disputed" }), makeItem({ status: "Shipped" })],
    });
    expect(getEligibleActions(order, "buyer").canOpenDispute).toBe(true);
  });

  it("canTriggerAutoRelease=true when item Shipped and majority_release_at past", () => {
    const order = makeOrder({
      global_status: "AllShipped",
      items: [
        makeItem({ status: "Shipped", shipment_group_id: GROUP_ID_1 }),
      ],
      shipment_groups: [
        makeGroup({
          id: GROUP_ID_1,
          // 1 day before pinned now=2026-05-04T12:00:00Z
          majority_release_at: "2026-05-03T12:00:00Z",
        }),
      ],
    });
    expect(getEligibleActions(order, "buyer").canTriggerAutoRelease).toBe(true);
  });

  it("canTriggerAutoRelease=false when majority_release_at still future", () => {
    const order = makeOrder({
      global_status: "AllShipped",
      items: [
        makeItem({ status: "Shipped", shipment_group_id: GROUP_ID_1 }),
      ],
      shipment_groups: [
        makeGroup({
          id: GROUP_ID_1,
          // 1 day after pinned now
          majority_release_at: "2026-05-05T12:00:00Z",
        }),
      ],
    });
    expect(getEligibleActions(order, "buyer").canTriggerAutoRelease).toBe(false);
  });

  it("canTriggerAutoRelease=false when item already Released", () => {
    const order = makeOrder({
      global_status: "Completed",
      items: [
        makeItem({ status: "Released", shipment_group_id: GROUP_ID_1 }),
      ],
      shipment_groups: [
        makeGroup({
          id: GROUP_ID_1,
          majority_release_at: "2026-05-03T12:00:00Z",
        }),
      ],
    });
    expect(getEligibleActions(order, "buyer").canTriggerAutoRelease).toBe(false);
  });

  it("empty items array : no actions are eligible", () => {
    const order = makeOrder({
      global_status: "Funded",
      items: [],
      item_count: 0,
    });
    const actions = getEligibleActions(order, "buyer");
    expect(actions.canConfirmDelivery).toBe(false);
    expect(actions.canOpenDispute).toBe(false);
  });
});

// ============================================================
// getEligibleActions — seller view (stubbed, V1 not consumed here)
// ============================================================
describe("getEligibleActions (seller)", () => {
  it("returns all-false to avoid drift with seller dashboard surface", () => {
    const order = makeOrder({
      global_status: "Funded",
      items: [makeItem({ status: "Shipped" })],
    });
    const actions = getEligibleActions(order, "seller");
    expect(actions).toEqual({
      canConfirmDelivery: false,
      canOpenDispute: false,
      canCancel: false,
      canTriggerAutoRelease: false,
    });
  });
});
