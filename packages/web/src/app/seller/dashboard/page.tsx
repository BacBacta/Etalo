import { Suspense } from "react";

import { SellerDashboardInner } from "@/app/seller/dashboard/SellerDashboardInner";

function DashboardLoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-base text-neutral-600">Loading dashboard…</p>
    </div>
  );
}

export default function SellerDashboardPage() {
  return (
    <Suspense fallback={<DashboardLoadingShell />}>
      <SellerDashboardInner />
    </Suspense>
  );
}
