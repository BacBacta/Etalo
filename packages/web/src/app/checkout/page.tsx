"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { CheckoutFlow } from "@/components/CheckoutFlow";
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

function LoadingShell() {
  return (
    <main
      id="main"
      className="flex min-h-screen items-center justify-center"
    >
      <div className="text-base text-neutral-600">Loading cart…</div>
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
