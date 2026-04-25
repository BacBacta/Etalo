"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { OrdersTab } from "@/components/seller/OrdersTab";
import { OverviewTab } from "@/components/seller/OverviewTab";
import { ProductsTab } from "@/components/seller/ProductsTab";
import { ProfileTab } from "@/components/seller/ProfileTab";
import { StakeTab } from "@/components/seller/StakeTab";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  fetchMyProfile,
  fetchSellerOnchainProfile,
  type SellerProfilePublic,
  type SellerProfileResponse,
} from "@/lib/seller-api";

const VALID_TABS = ["overview", "products", "orders", "stake", "profile"] as const;
type TabKey = (typeof VALID_TABS)[number];

export function SellerDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address } = useAccount();

  const [isMiniPay, setIsMiniPay] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<SellerProfilePublic | null>(null);
  const [onchain, setOnchain] = useState<SellerProfileResponse | null>(null);
  const [error, setError] = useState<"not_found" | "fetch_failed" | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // 1) MiniPay gating — same pattern as /marketplace.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const provider = (window as unknown as { ethereum?: { isMiniPay?: boolean } })
      .ethereum;
    const detected = provider?.isMiniPay === true;
    setIsMiniPay(detected);
    if (!detected) router.replace("/");
  }, [router]);

  // 2) Combined fetch: identity (/sellers/me) + on-chain (/sellers/{addr}/profile)
  useEffect(() => {
    if (isMiniPay !== true || !address) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchMyProfile(address), fetchSellerOnchainProfile(address)])
      .then(([me, on]) => {
        if (cancelled) return;
        if (!me) {
          setError("not_found");
          return;
        }
        setProfile(me);
        setOnchain(on);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("fetch_failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isMiniPay, address]);

  const requestedTab = searchParams.get("tab") as TabKey | null;
  const safeTab: TabKey =
    requestedTab && VALID_TABS.includes(requestedTab) ? requestedTab : "overview";

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/seller/dashboard?${params.toString()}`);
  };

  if (isMiniPay === null) {
    return (
      <Shell>
        <p className="text-base text-neutral-600">Loading…</p>
      </Shell>
    );
  }
  if (isMiniPay === false) return null;

  if (loading) {
    return (
      <Shell>
        <p className="text-base text-neutral-600">Loading dashboard…</p>
      </Shell>
    );
  }

  if (error === "not_found") {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-12 text-center">
          <h2 className="mb-3 text-xl font-semibold">No seller profile yet</h2>
          <p className="mb-4 text-base text-neutral-700">
            Etalo is in a curated launch phase. To set up your shop, please
            contact our team.
          </p>
          <p className="text-sm text-neutral-500">
            Self-service onboarding coming in V1.5.
          </p>
        </div>
      </Shell>
    );
  }

  if (error === "fetch_failed" || !profile || !onchain || !address) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-12 text-center">
          <h2 className="mb-3 text-xl font-semibold">
            Couldn&apos;t load dashboard
          </h2>
          <p className="mb-4 text-base text-neutral-700">
            Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-2 text-base underline"
          >
            Retry
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold">Your shop</h1>
        <p className="mb-6 text-sm text-neutral-600">@{profile.shop_handle}</p>

        <Tabs value={safeTab} onValueChange={setTab}>
          <TabsList className="mb-6 grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="stake">Stake</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              profile={profile}
              onchain={onchain}
              address={address}
            />
          </TabsContent>
          <TabsContent value="products">
            <ProductsTab profile={profile} />
          </TabsContent>
          <TabsContent value="orders">
            <OrdersTab address={address} />
          </TabsContent>
          <TabsContent value="stake">
            <StakeTab onchain={onchain} />
          </TabsContent>
          <TabsContent value="profile">
            <ProfileTab
              profile={profile}
              address={address}
              onUpdated={setProfile}
            />
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <div className="flex min-h-screen flex-col items-center justify-center">
        {children}
      </div>
    </main>
  );
}
