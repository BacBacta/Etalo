import { Suspense } from "react";

import { SellerDashboardInner } from "@/app/(app)/seller/dashboard/SellerDashboardInner";
import { TracedDashboardSkeleton } from "@/app/(app)/seller/dashboard/TracedDashboardSkeleton";

export default function SellerDashboardPage() {
  return (
    // TracedDashboardSkeleton logs `[SuspenseFallback] mounted` to
    // the wallet-debug overlay so we can confirm whether a stuck
    // skeleton is the page.tsx Suspense fallback (SellerDashboardInner
    // suspended during render — useSearchParams or dynamic import
    // didn't resolve) vs the SellerDashboardInner's own loading gate.
    <Suspense fallback={<TracedDashboardSkeleton />}>
      <SellerDashboardInner />
    </Suspense>
  );
}
