"use client";

import dynamic from "next/dynamic";
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
import { detectMiniPay } from "@/lib/minipay-detect";

// J10-V5 Phase 5 Angle F sub-block F.2 — OpenInMiniPayModal imports
// qrcode.react (~10-15 KB) used ONLY for non-MiniPay browsers (cold
// path — most users come from MiniPay WebView and skip directly to
// CheckoutFlow). Dynamic-load the modal so the qrcode.react chunk
// stays out of the /checkout main bundle for the dominant MiniPay
// path. Mirror sub-block 6.3 MilestoneDialogV5 lazy pattern (commit
// 3872411). loading: () => null because the modal is conditionally
// rendered, no fallback shape needed during the chunk fetch window.
const OpenInMiniPayModal = dynamic(
  () =>
    import("@/components/OpenInMiniPayModal").then(
      (mod) => mod.OpenInMiniPayModal,
    ),
  { ssr: false, loading: () => null },
);

// J10-V5 Phase 5 Angle B sub-block B.2 — skeleton structure mirrors
// the real CheckoutFlow layout (h1 title + 3 item rows + total +
// CTA) so the user gets a layout-stable preview while the cart token
// resolves. Mirror DashboardSkeleton pattern from Phase 5 polish #7.
function LoadingShell() {
  return (
    <main id="main" className="min-h-screen p-4">
      <div className="mx-auto w-full max-w-md rounded-lg bg-white p-6 shadow">
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

function CheckoutPageInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [resolvedCart, setResolvedCart] = useState<ResolvedCart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMiniPay, setIsMiniPay] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMiniPay(detectMiniPay());
  }, []);

  useEffect(() => {
    if (!token) {
      setError("No cart token provided.");
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
          setError(
            "Your cart link has expired. Please go back and start checkout again.",
          );
        } else if (err instanceof CartTokenInvalidError) {
          setError("Invalid cart link.");
        } else {
          setError("Failed to load cart. Please try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <main
        id="main"
        className="flex min-h-screen items-center justify-center p-8"
      >
        <div className="max-w-md text-center">
          <h2 className="mb-3 text-xl font-semibold">Checkout error</h2>
          <p className="text-base text-neutral-700">{error}</p>
        </div>
      </main>
    );
  }

  if (!resolvedCart || isMiniPay === null) {
    return <LoadingShell />;
  }

  if (!isMiniPay) {
    return <OpenInMiniPayModal token={token!} cart={resolvedCart} />;
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
