"use client";

import { LazyMotion, domMax, type PanInfo } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CartItemRow } from "@/components/CartItemRow";
import { Button } from "@/components/ui/button";
import {
  SheetV4,
  SheetV4Content,
  SheetV4Description,
  SheetV4Title,
} from "@/components/ui/v4/Sheet";
import { AnimatedNumber } from "@/components/ui/v4/AnimatedNumber";
import { type SellerGroup, useCartStore } from "@/lib/cart-store";
import { CartValidationError, postCartToken } from "@/lib/checkout";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// J10-V5 Phase 5 Block 2 sub-block 2.2 — swipe-to-close thresholds.
// Cart drawer slides out from the right; a rightward swipe closes it.
// 100 px distance OR 500 px/s velocity matches iOS / Android / Robinhood
// conventions for sheet dismissal. Either condition triggers close so
// short flicks dismiss as reliably as long drags.
export const DRAG_CLOSE_THRESHOLD_PX = 100;
export const DRAG_CLOSE_VELOCITY_PX_PER_SEC = 500;

export function shouldCloseOnSwipe(info: {
  offset: { x: number };
  velocity: { x: number };
}): boolean {
  return (
    info.offset.x > DRAG_CLOSE_THRESHOLD_PX ||
    info.velocity.x > DRAG_CLOSE_VELOCITY_PX_PER_SEC
  );
}

export function CartDrawer({ open, onOpenChange }: Props) {
  // Read the raw `items` array (a stable reference from Zustand —
  // changes only when the store actually mutates) and compute derived
  // values with useMemo. Earlier attempts wrapped the store getters
  // (getSellerGroups / getTotalUsdt / getItemCount) with useShallow,
  // but useShallow performs shallow equality on the returned object's
  // top-level keys — it cannot see through nested arrays. Each call
  // to s.getSellerGroups() returns Array.from(map.values()), a fresh
  // array reference, so Object.is at the `sellerGroups` key always
  // returned false. useShallow therefore yielded a new object every
  // render, which useSyncExternalStore reported as
  // "result of getServerSnapshot should be cached" → loop.
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const { sellerGroups, totalUsdt, itemCount } = useMemo(() => {
    const groups = new Map<string, SellerGroup>();
    let total = 0;
    let count = 0;
    for (const item of items) {
      const lineTotal = Number(item.priceUsdt) * item.qty;
      total += lineTotal;
      count += item.qty;
      const existing = groups.get(item.sellerHandle);
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
    return {
      sellerGroups: Array.from(groups.values()),
      totalUsdt: total,
      itemCount: count,
    };
  }, [items]);

  const router = useRouter();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const sellerCount = sellerGroups.length;

  const handleCheckout = async () => {
    if (isCheckingOut) return;
    setIsCheckingOut(true);
    try {
      const items = sellerGroups.flatMap((g) =>
        g.items.map((i) => ({
          productId: i.productId,
          qty: i.qty,
        })),
      );
      const { token } = await postCartToken(items);
      onOpenChange(false);
      router.push(`/checkout?token=${encodeURIComponent(token)}`);
    } catch (err) {
      if (err instanceof CartValidationError) {
        for (const e of err.errors) {
          const tail =
            e.available_qty != null ? ` (only ${e.available_qty} available)` : "";
          toast.error(
            `Item ${e.product_id.slice(0, 8)}…: ${e.reason}${tail}`,
          );
        }
      } else {
        toast.error("Checkout failed. Please try again.");
      }
    } finally {
      setIsCheckingOut(false);
    }
  };

  const closeDrawer = () => onOpenChange(false);

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (shouldCloseOnSwipe(info)) {
      onOpenChange(false);
    }
    // Below threshold → dragSnapToOrigin animates the drawer back to x=0.
  };

  // J10-V5 Phase 5 Block 2 sub-block 2.1 — nested LazyMotion features={domMax}
  // scopes drag/layout feature loading to the cart drawer subtree.
  // The outer MotionProvider (Providers.tsx) ships domAnimation (~17 KB) to
  // every page; domMax (~25 KB) only loads here, paying the +8 KB delta in
  // the chunks that actually need swipe-to-close gestures (sub-block 2.2).
  // Multiple LazyMotion strict are allowed in motion v12; the closest
  // ancestor wins for `m.*` descendants, so the rest of the app keeps the
  // smaller domAnimation bundle.
  //
  // Sub-block 2.2 — drag="x" + dragConstraints={{ left: 0 }} prevents the
  // drawer from being pulled inward (further into the screen) past its
  // resting position. dragSnapToOrigin returns it to x=0 if the user
  // releases below the swipe-to-close threshold. Native ESC + backdrop
  // click + close button stay wired via Radix DialogPrimitive — drag is
  // a pure UX enhancement, not an a11y replacement.
  return (
    <LazyMotion features={domMax} strict>
      <SheetV4 open={open} onOpenChange={onOpenChange}>
        <SheetV4Content
          side="right"
          className="flex w-full max-w-none flex-col p-0 sm:max-w-md"
          drag="x"
          dragConstraints={{ left: 0 }}
          dragElastic={0.2}
          dragSnapToOrigin
          onDragEnd={handleDragEnd}
        >
          <div className="border-b border-neutral-200 px-4 py-4">
            <SheetV4Title className="text-lg">
              {itemCount > 0 ? `Your cart (${itemCount})` : "Your cart"}
            </SheetV4Title>
            <SheetV4Description className="sr-only">
              Review the items in your cart and proceed to checkout.
            </SheetV4Description>
          </div>

          {sellerCount === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
              <p className="mb-2 text-base text-neutral-700">
                Your cart is empty
              </p>
              <p className="text-sm text-neutral-500">
                Browse Etalo shops and add items to start a cart.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {sellerGroups.map((group) => (
                <div
                  key={group.sellerHandle}
                  className="border-b border-neutral-200 px-4 py-4"
                >
                  <div className="mb-3 flex items-baseline justify-between">
                    <Link
                      href={`/${group.sellerHandle}`}
                      onClick={closeDrawer}
                      className="text-base font-semibold underline"
                    >
                      {group.sellerShopName}
                    </Link>
                    <span className="text-sm text-neutral-600 tabular-nums">
                      {group.subtotalUsdt.toFixed(2)} USDT
                    </span>
                  </div>
                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <CartItemRow
                        key={item.productId}
                        item={item}
                        onNavigate={closeDrawer}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {sellerCount > 0 ? (
            <div className="mt-auto flex flex-col gap-3 border-t border-neutral-200 px-4 py-4">
              <div className="flex w-full items-center justify-between">
                <span className="text-base font-semibold">Total</span>
                <span className="text-base font-semibold">
                  <AnimatedNumber
                    value={totalUsdt}
                    decimals={2}
                    suffix=" USDT"
                  />
                </span>
              </div>
              <Button
                type="button"
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="min-h-[44px] w-full text-base"
              >
                {isCheckingOut
                  ? "Preparing checkout…"
                  : `Checkout in MiniPay (${sellerCount} ${
                      sellerCount === 1 ? "seller" : "sellers"
                    })`}
              </Button>
              <button
                type="button"
                onClick={() => clearCart()}
                disabled={isCheckingOut}
                className="min-h-[44px] self-center px-2 text-sm text-neutral-500 underline disabled:opacity-50"
              >
                Clear cart
              </button>
            </div>
          ) : null}
        </SheetV4Content>
      </SheetV4>
    </LazyMotion>
  );
}
