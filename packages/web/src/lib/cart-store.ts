import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CartItem {
  productId: string;
  productSlug: string;
  sellerHandle: string;
  sellerShopName: string;
  title: string;
  // string Decimal — preserves precision for the on-chain BigInt parse
  // in Block 5; consumers convert to Number only for display math.
  priceUsdt: string;
  imageUrl: string | null;
  qty: number;
  // Captured at add time; used to cap further increments without a
  // round-trip to the API. Block 5 will revalidate on checkout.
  stockSnapshot: number;
  addedAt: string;
}

export interface SellerGroup {
  sellerHandle: string;
  sellerShopName: string;
  items: CartItem[];
  subtotalUsdt: number;
}

interface CartState {
  items: CartItem[];

  addItem: (
    item: Omit<CartItem, "qty" | "addedAt"> & { qty?: number },
  ) => void;
  updateQty: (productId: string, qty: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  clearSellerItems: (sellerHandle: string) => void;

  getItemCount: () => number;
  getSellerGroups: () => SellerGroup[];
  getTotalUsdt: () => number;
  getItemQty: (productId: string) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find(
            (i) => i.productId === item.productId,
          );
          const addedQty = item.qty ?? 1;
          if (existing) {
            const newQty = Math.min(
              existing.qty + addedQty,
              existing.stockSnapshot,
            );
            return {
              items: state.items.map((i) =>
                i.productId === item.productId ? { ...i, qty: newQty } : i,
              ),
            };
          }
          const cappedQty = Math.min(
            Math.max(addedQty, 1),
            item.stockSnapshot,
          );
          return {
            items: [
              ...state.items,
              {
                ...item,
                qty: cappedQty,
                addedAt: new Date().toISOString(),
              },
            ],
          };
        });
      },

      updateQty: (productId, qty) => {
        set((state) => {
          if (qty <= 0) {
            return {
              items: state.items.filter((i) => i.productId !== productId),
            };
          }
          return {
            items: state.items.map((i) => {
              if (i.productId !== productId) return i;
              return { ...i, qty: Math.min(qty, i.stockSnapshot) };
            }),
          };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        }));
      },

      clearCart: () => set({ items: [] }),

      clearSellerItems: (sellerHandle) => {
        set((state) => ({
          items: state.items.filter(
            (i) => i.sellerHandle !== sellerHandle,
          ),
        }));
      },

      getItemCount: () =>
        get().items.reduce((sum, i) => sum + i.qty, 0),

      getSellerGroups: () => {
        const groups = new Map<string, SellerGroup>();
        for (const item of get().items) {
          const existing = groups.get(item.sellerHandle);
          const lineTotal = Number(item.priceUsdt) * item.qty;
          if (existing) {
            existing.items.push(item);
            existing.subtotalUsdt += lineTotal;
          } else {
            groups.set(item.sellerHandle, {
              sellerHandle: item.sellerHandle,
              sellerShopName: item.sellerShopName,
              items: [item],
              subtotalUsdt: lineTotal,
            });
          }
        }
        return Array.from(groups.values());
      },

      getTotalUsdt: () =>
        get().items.reduce(
          (sum, i) => sum + Number(i.priceUsdt) * i.qty,
          0,
        ),

      getItemQty: (productId) =>
        get().items.find((i) => i.productId === productId)?.qty ?? 0,
    }),
    {
      name: "etalo-cart-v1",
      storage: createJSONStorage(() => localStorage),
      // Defer reading localStorage until after mount. Without this,
      // SSR initializes with empty `items: []` while the client
      // initializes with persisted items, producing a hydration
      // mismatch that cascades into "result of getServerSnapshot
      // should be cached" loops on every useCartStore subscriber.
      // The CartHydrationGate in Providers.tsx triggers manual
      // rehydrate() once, post-mount, on the client.
      skipHydration: true,
    },
  ),
);

// Triggers manual rehydration of the persisted cart from localStorage
// once on mount. Server + client first render both produce empty cart
// state (identical DOM) → no hydration mismatch. After rehydrate runs,
// any populated cart data triggers a normal client re-render.
//
// localStorage is synchronous, so rehydrate() resolves before
// setHydrated(true) is observable. For future async storages, switch
// to persist.onFinishHydration().
export function useCartHydration(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    useCartStore.persist.rehydrate();
    setHydrated(true);
  }, []);
  return hydrated;
}
