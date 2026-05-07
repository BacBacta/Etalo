"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { DashboardSkeleton } from "@/app/seller/dashboard/DashboardSkeleton";
import { MarketingTab } from "@/components/seller/MarketingTab";
import { OrdersTab } from "@/components/seller/OrdersTab";
import { OverviewTab } from "@/components/seller/OverviewTab";
import { ProductsTab } from "@/components/seller/ProductsTab";
import { ProfileTab } from "@/components/seller/ProfileTab";
import {
  TabsV4Content,
  TabsV4List,
  TabsV4Root,
  TabsV4Trigger,
} from "@/components/ui/v4/Tabs";
import { detectMiniPay } from "@/lib/minipay-detect";
import {
  fetchMyProfile,
  type SellerProfilePublic,
} from "@/lib/seller-api";

// Block 5 sub-block 5.1 — "stake" tab dropped per ADR-041 V1 scope
// (stake retired, cross-border deferred V2). Five tabs remain.
const VALID_TABS = [
  "overview",
  "products",
  "orders",
  "profile",
  "marketing",
] as const;
type TabKey = (typeof VALID_TABS)[number];

export function SellerDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address } = useAccount();

  const [isMiniPay, setIsMiniPay] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<SellerProfilePublic | null>(null);
  const [error, setError] = useState<"not_found" | "fetch_failed" | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // 1) MiniPay gating — same pattern as /marketplace, via the shared
  // detectMiniPay() helper (Pattern D : env override + canonical flag
  // + UA fallback for Mini App Test mode).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const detected = detectMiniPay();
    setIsMiniPay(detected);
    if (!detected) router.replace("/");
  }, [router]);

  // 2) Identity fetch (/sellers/me). Block 5 sub-block 5.4 dropped the
  // parallel `fetchSellerOnchainProfile` call — its only consumers were
  // StakeTab (retired in 5.1) and OverviewTab's stake StatCards (also
  // retired in 5.1). The dashboard's KPI surface now sources its
  // numbers from useAnalyticsSummary (sub-block 5.3) directly inside
  // OverviewTab, so the parent only needs the off-chain identity row.
  useEffect(() => {
    if (isMiniPay !== true || !address) return;
    let cancelled = false;
    setLoading(true);
    fetchMyProfile(address)
      .then((me) => {
        if (cancelled) return;
        if (!me) {
          setError("not_found");
          return;
        }
        setProfile(me);
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

  // Auto-scroll the active tab into view when it changes. The tab list
  // is `overflow-x-auto` so on a 360 px viewport with 5 tabs, the active
  // one can be partially or fully off-screen depending on the previous
  // selection (screenshot bug : "Overview" was clipped to "iew" because
  // it sits at index 0 and the row had been scrolled by selecting a
  // later tab). `inline: 'center'` keeps it visually centered ;
  // `block: 'nearest'` prevents the page itself from jumping vertically
  // when the dashboard re-renders.
  const tabsListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = tabsListRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-state="active"]');
    if (!active) return;
    active.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [safeTab]);

  // J10-V5 Phase 5 polish #7 — both pre-render gates (MiniPay
  // detection + profile fetch) now share the DashboardSkeleton so the
  // user sees the page structure on first paint instead of two
  // successive "Loading…" text flashes. The MiniPay detection branch
  // resolves in <50 ms typically, but the skeleton stays consistent
  // with the longer profile-fetch branch — no jarring "text →
  // skeleton → real" sequence.
  if (isMiniPay === null) {
    return <DashboardSkeleton />;
  }
  if (isMiniPay === false) return null;

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error === "not_found") {
    return (
      <StatusShell>
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
      </StatusShell>
    );
  }

  if (error === "fetch_failed" || !profile || !address) {
    return (
      <StatusShell>
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
      </StatusShell>
    );
  }

  return (
    <main id="main" className="min-h-screen">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold">Your shop</h1>
        <p className="mb-6 text-sm text-neutral-600">@{profile.shop_handle}</p>

        <TabsV4Root value={safeTab} onValueChange={setTab}>
          {/*
            TabsV4List is a horizontal flex with a sliding indicator that
            measures `data-state="active"` descendants. The legacy grid
            `grid-cols-3 sm:grid-cols-6` is dropped — the V4 list is
            already responsive and the sliding indicator is the visual
            anchor instead of equal-width columns. Wrap with
            overflow-x-auto so 6 tabs remain reachable on 360px viewports
            without breaking the indicator measurement.
          */}
          {/*
            J10-V5 Phase 5 Angle B Track 2 fix #2 — Profile moved to 2nd
            position (was 4th, between Orders and Marketing). Mike's
            use-app perceptual audit caught Profile being hidden in the
            tabs row : new sellers needed easy access to fill out their
            shop identity (name, description, logo, socials) before
            anything else makes sense to do. Putting Profile right next
            to Overview in the tab order makes it the natural second
            stop for any seller landing on the dashboard.
          */}
          <TabsV4List
            ref={tabsListRef}
            className="mb-6 w-full overflow-x-auto"
          >
            <TabsV4Trigger value="overview">Overview</TabsV4Trigger>
            <TabsV4Trigger value="profile">Profile</TabsV4Trigger>
            <TabsV4Trigger value="products">Products</TabsV4Trigger>
            <TabsV4Trigger value="orders">Orders</TabsV4Trigger>
            <TabsV4Trigger value="marketing">Marketing</TabsV4Trigger>
          </TabsV4List>

          <TabsV4Content value="overview">
            <OverviewTab profile={profile} address={address} />
          </TabsV4Content>
          <TabsV4Content value="products">
            <ProductsTab profile={profile} walletAddress={address} />
          </TabsV4Content>
          <TabsV4Content value="orders">
            <OrdersTab address={address} />
          </TabsV4Content>
          <TabsV4Content value="profile">
            <ProfileTab
              profile={profile}
              address={address}
              onUpdated={setProfile}
            />
          </TabsV4Content>
          <TabsV4Content value="marketing">
            <MarketingTab />
          </TabsV4Content>
        </TabsV4Root>
      </div>
    </main>
  );
}

// Phase 4 hotfix #8 — Shell renamed to StatusShell + scope narrowed to
// short loading/error messages only. The previous Shell wrapped EVERY
// render path including the main dashboard; its `flex flex-col
// items-center justify-center` makes flex children content-sized on
// the cross axis. With no `w-full` on the inner container, the parent
// grew to fit `TabsV4List`'s natural ~536 px width (6 triggers x ~86
// px + gaps), which defeated the tabs' `overflow-x-auto` (no overflow
// when container == content) and pushed the whole `<main>` past a
// 360-414 px viewport — page-level horizontal scroll, header shifted
// right, KPI grid extending off-screen. The main render now bypasses
// StatusShell entirely with `<main><div className="w-full max-w-3xl
// ...">`, which constrains TabsV4List to viewport width and lets its
// own `overflow-x-auto` scope contain the tab scroll properly.
function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="min-h-screen">
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        {children}
      </div>
    </main>
  );
}
