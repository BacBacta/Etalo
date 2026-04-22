import { Button } from "@/components/ui/button";
import { MobileLayout } from "@/components/layouts/MobileLayout";
import { ShopHandle } from "@/components/shared/ShopHandle";
import { useSellerProfile } from "@/hooks/useSellerProfile";

/**
 * Post-connection landing for sellers.
 *
 * This is a stub for Block 3 — the real 6-block analytics dashboard
 * lands in Block 5. We render the shop identity, a "Create product"
 * CTA, and nothing else.
 */
export default function SellerHome() {
  const { data } = useSellerProfile();
  const profile = data?.profile;

  if (!profile) return null; // guard handles redirect

  return (
    <MobileLayout
      header={<ShopHandle handle={profile.shop_handle} name={profile.shop_name} />}
      bottomCta={
        <Button className="w-full" size="lg">
          Add a product
        </Button>
      }
    >
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-base text-muted-foreground">
          Your dashboard lands in Block 5. For now, this page confirms
          that your shop is live and reachable.
        </p>
      </section>
    </MobileLayout>
  );
}
