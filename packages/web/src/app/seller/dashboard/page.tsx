import { Suspense } from "react";

import { DashboardSkeleton } from "@/app/seller/dashboard/DashboardSkeleton";
import { SellerDashboardInner } from "@/app/seller/dashboard/SellerDashboardInner";

export default function SellerDashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <SellerDashboardInner />
    </Suspense>
  );
}
