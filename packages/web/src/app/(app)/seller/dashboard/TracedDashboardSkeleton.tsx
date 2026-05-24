/**
 * TracedDashboardSkeleton — Suspense fallback wrapper that logs to
 * the walletLog buffer when mounted. Lets us distinguish two
 * skeleton-render paths :
 *
 *  1. `page.tsx <Suspense fallback>` fires → this component mounts
 *     and logs "[SuspenseFallback] mounted". Means SellerDashboardInner
 *     suspended during render (likely useSearchParams or a dynamic
 *     import) and the user is stuck on the static/SSR fallback.
 *
 *  2. `SellerDashboardInner gate 4 (loading=true)` fires → uses the
 *     plain DashboardSkeleton (no log). Means the dashboard component
 *     mounted fine but is fetching profile.
 *
 * Same visual as the plain DashboardSkeleton ; the only difference is
 * the diagnostic log on mount + unmount.
 */
"use client";

import { useEffect } from "react";

import { DashboardSkeleton } from "@/app/(app)/seller/dashboard/DashboardSkeleton";
import { walletLog } from "@/lib/wallet-debug";

export function TracedDashboardSkeleton() {
  useEffect(() => {
    walletLog("[SuspenseFallback] mounted (SellerDashboardInner suspended)");
    return () => {
      walletLog("[SuspenseFallback] unmounted (SellerDashboardInner resolved)");
    };
  }, []);

  return <DashboardSkeleton />;
}
