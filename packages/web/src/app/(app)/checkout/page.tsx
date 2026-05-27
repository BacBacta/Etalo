"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { CheckoutFlow } from "@/components/CheckoutFlow";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import {
  CartTokenExpiredError,
  CartTokenInvalidError,
  resolveCartToken,
  type ResolvedCart,
} from "@/lib/checkout";

// ADR-052/053 — the previous `!isMiniPay → OpenInMiniPayModal` gate
// is removed. Chrome users with an injected wallet (MetaMask, Trust,
// Rabby, …) checkout via the same `CheckoutFlow` ; users without any
// wallet see the "Connect wallet / Get MiniPay" prompt rendered by
// `CheckoutFlow` itself. `OpenInMiniPayModal` remains in the repo for
// a future share-via-QR flow but is not on the live checkout path.

// J10-V5 Phase 5 Angle B sub-block B.2 — skeleton structure mirrors
// the real CheckoutFlow layout (h1 title + 3 item rows + total +
// CTA) so the user gets a layout-stable preview while the cart token
// resolves. Mirror DashboardSkeleton pattern from Phase 5 polish #7.
function LoadingShell() {
  return (
    <main id="main" className="min-h-screen p-4">
      <div className="mx-auto w-full max-w-md rounded-lg bg-white p-6 shadow dark:bg-celo-dark-elevated dark:shadow-none dark:ring-1 dark:ring-celo-light/10">
        <SkeletonV5 variant="text" className="mb-4 h-6 w-40" />
        <div className="mb-4 flex flex-col gap-3">
          <SkeletonV5 variant="row" />
          <SkeletonV5 variant="row" />
          <SkeletonV5 variant="row" />
        </div>
        <SkeletonV5 variant="text" className="mb-4 h-5 w-32" />
        <SkeletonV5
          variant="rectangle"
          className="h-12 w-full rounded-md"
        />
      </div>
    </main>
  );
}

type ErrorKind = "expired" | "invalid" | "missing-token" | "unknown";

interface ErrorState {
  kind: ErrorKind;
  message: string;
}

function CheckoutPageInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [resolvedCart, setResolvedCart] = useState<ResolvedCart | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);

  useEffect(() => {
    if (!token) {
      setError({ kind: "missing-token", message: "No cart link provided." });
      return;
    }
    let cancelled = false;
    resolveCartToken(token)
      .then((cart) => {
        if (!cancelled) setResolvedCart(cart);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof CartTokenExpiredError) {
          setError({
            kind: "expired",
            message:
              "Your cart link expired. Go back to your cart to start a fresh checkout — your items are still saved.",
          });
        } else if (err instanceof CartTokenInvalidError) {
          setError({
            kind: "invalid",
            message:
              "This cart link can't be verified. Open your cart and start checkout again.",
          });
        } else {
          setError({
            kind: "unknown",
            message: "Couldn't load your cart. Please try again.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    // Every kind that can be recovered with a fresh cart-token (i.e.
    // "go back to /cart and re-submit") gets the same primary CTA.
    // 'unknown' could be a transient network/backend issue ; surface a
    // soft "try again" alongside the cart fallback so the user has a
    // path regardless.
    const showRetry = error.kind === "unknown";
    return (
      <main
        id="main"
        className="flex min-h-screen items-center justify-center p-8"
      >
        <div className="max-w-md text-center">
          <h2 className="mb-3 text-xl font-semibold">Checkout error</h2>
          <p className="mb-5 text-base text-neutral-700 dark:text-celo-light/70">
            {error.message}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/cart"
              data-testid="checkout-error-back-to-cart"
              className="inline-flex min-h-[44px] items-center justify-center rounded-pill bg-celo-forest px-5 text-sm font-medium text-celo-light hover:bg-celo-forest-dark dark:bg-celo-green dark:text-celo-dark dark:hover:bg-celo-green-hover"
            >
              Back to my cart
            </Link>
            {showRetry ? (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-pill border border-neutral-300 px-5 text-sm font-medium text-celo-dark hover:bg-neutral-50 dark:border-celo-light/30 dark:text-celo-light dark:hover:bg-celo-dark-elevated"
              >
                Try again
              </button>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  if (!resolvedCart) {
    return <LoadingShell />;
  }

  return <CheckoutFlow cart={resolvedCart} token={token!} />;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <CheckoutPageInner />
    </Suspense>
  );
}
