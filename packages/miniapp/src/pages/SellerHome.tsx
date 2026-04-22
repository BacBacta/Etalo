import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { MobileLayout } from "@/components/layouts/MobileLayout";
import { ActiveOrdersCard } from "@/components/dashboard/ActiveOrdersCard";
import { EscrowCard } from "@/components/dashboard/EscrowCard";
import { NotificationsCard } from "@/components/dashboard/NotificationsCard";
import { ReputationCard } from "@/components/dashboard/ReputationCard";
import { RevenueCard } from "@/components/dashboard/RevenueCard";
import { TopProductsCard } from "@/components/dashboard/TopProductsCard";
import { ShopHandle } from "@/components/shared/ShopHandle";
import { useSellerProfile } from "@/hooks/useSellerProfile";

export default function SellerHome() {
  const queryClient = useQueryClient();
  const { data } = useSellerProfile();
  const profile = data?.profile;

  if (!profile) return null; // RequireSellerProfile guard handles redirect

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <MobileLayout
      header={
        <div className="flex w-full items-center justify-between">
          <ShopHandle
            handle={profile.shop_handle}
            name={profile.shop_name}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={refresh}
            aria-label="Refresh dashboard"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      }
      bottomCta={
        <Button className="w-full" size="lg">
          Add a product
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <RevenueCard />
        <ActiveOrdersCard />
        <EscrowCard />
        <TopProductsCard />
        <ReputationCard />
        <NotificationsCard />
      </div>
    </MobileLayout>
  );
}
