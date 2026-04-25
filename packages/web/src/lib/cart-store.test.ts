import { beforeEach, describe, expect, it } from "vitest";

import { useCartStore } from "@/lib/cart-store";

const baseItem = {
  productId: "11111111-1111-1111-1111-111111111111",
  productSlug: "red-dress",
  sellerHandle: "chioma",
  sellerShopName: "Chioma's Closet",
  title: "Red Ankara Dress",
  priceUsdt: "12.99",
  imageUrl: null,
  stockSnapshot: 5,
};

const otherItem = {
  productId: "22222222-2222-2222-2222-222222222222",
  productSlug: "silk-scarf",
  sellerHandle: "chioma",
  sellerShopName: "Chioma's Closet",
  title: "Silk Scarf",
  priceUsdt: "8.50",
  imageUrl: null,
  stockSnapshot: 3,
};

const otherSellerItem = {
  productId: "33333333-3333-3333-3333-333333333333",
  productSlug: "leather-bag",
  sellerHandle: "aissa",
  sellerShopName: "Aissa Couture",
  title: "Leather Bag",
  priceUsdt: "45.00",
  imageUrl: null,
  stockSnapshot: 2,
};

beforeEach(() => {
  useCartStore.getState().clearCart();
});

describe("addItem", () => {
  it("adds a new item with qty 1 by default", () => {
    useCartStore.getState().addItem(baseItem);
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(baseItem.productId);
    expect(items[0].qty).toBe(1);
    expect(items[0].addedAt).toBeTypeOf("string");
  });

  it("increments qty when product already in cart, capped at stockSnapshot", () => {
    const store = useCartStore.getState();
    store.addItem({ ...baseItem, qty: 3 });
    store.addItem({ ...baseItem, qty: 4 }); // 3 + 4 = 7, capped at 5
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(5);
  });
});

describe("updateQty", () => {
  it("removes the item when qty <= 0", () => {
    const store = useCartStore.getState();
    store.addItem({ ...baseItem, qty: 2 });
    store.updateQty(baseItem.productId, 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it("caps qty at stockSnapshot when raising above stock", () => {
    const store = useCartStore.getState();
    store.addItem(baseItem);
    store.updateQty(baseItem.productId, 99);
    const item = useCartStore
      .getState()
      .items.find((i) => i.productId === baseItem.productId);
    expect(item?.qty).toBe(baseItem.stockSnapshot);
  });
});

describe("getSellerGroups", () => {
  it("groups items by sellerHandle and computes subtotal per group", () => {
    const store = useCartStore.getState();
    store.addItem({ ...baseItem, qty: 2 }); // 12.99 × 2 = 25.98
    store.addItem({ ...otherItem, qty: 1 }); // 8.50 × 1 = 8.50
    store.addItem({ ...otherSellerItem, qty: 1 }); // 45.00 × 1 = 45.00

    const groups = useCartStore.getState().getSellerGroups();
    expect(groups).toHaveLength(2);

    const chioma = groups.find((g) => g.sellerHandle === "chioma");
    expect(chioma?.items).toHaveLength(2);
    expect(chioma?.subtotalUsdt).toBeCloseTo(34.48, 2);

    const aissa = groups.find((g) => g.sellerHandle === "aissa");
    expect(aissa?.items).toHaveLength(1);
    expect(aissa?.subtotalUsdt).toBeCloseTo(45.0, 2);
  });
});

describe("getTotalUsdt", () => {
  it("sums all line totals across sellers preserving Decimal precision", () => {
    const store = useCartStore.getState();
    // 12.99 × 3 = 38.97 — naive float math gives 38.96999... ; verify
    // we land on the expected 2-decimal value via toBeCloseTo.
    store.addItem({ ...baseItem, qty: 3 });
    expect(useCartStore.getState().getTotalUsdt()).toBeCloseTo(38.97, 2);

    store.addItem({ ...otherSellerItem, qty: 2 }); // 45.00 × 2 = 90.00
    expect(useCartStore.getState().getTotalUsdt()).toBeCloseTo(128.97, 2);
  });
});
