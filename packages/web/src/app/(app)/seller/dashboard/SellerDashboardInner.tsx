"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import dynamic from "next/dynamic";

import { DashboardSkeleton } from "@/app/(app)/seller/dashboard/DashboardSkeleton";
import { OverviewTab } from "@/components/seller/OverviewTab";
import { ProfileTab } from "@/components/seller/ProfileTab";

// Phase A P0-2 (2026-05-15) — bundle reduction. The dashboard's eager
// First Load JS was 276 kB (perf score 27). Three of these imports
// (OnboardingWizard, MarketingTab, OrdersTab, ProductsTab) only render
// based on tab selection or seller-not-found state — perfect lazy
// candidates. Overview + Profile stay eager because Overview is the
// default landing tab and Profile is the second-priority tab (Mike's
// audit J10-V5 Phase 5 Track 2 fix #2). Loading fallback null because
// the parent Suspense / DashboardSkeleton already covers first paint
// and tab switches are user-initiated.
const OnboardingWizard = dynamic(
  () =>
    import("@/components/seller/OnboardingWizard").then(
      (m) => m.OnboardingWizard,
    ),
  { ssr: false, loading: () => null },
);
const ProductsTab = dynamic(
  () =>
    import("@/components/seller/ProductsTab").then((m) => m.ProductsTab),
  { ssr: false, loading: () => null },
);
const OrdersTab = dynamic(
  () =>
    import("@/components/seller/OrdersTab").then((m) => m.OrdersTab),
  { ssr: false, loading: () => null },
);
const MarketingTab = dynamic(
  () =>
    import("@/components/seller/MarketingTab").then((m) => m.MarketingTab),
  { ssr: false, loading: () => null },
);
import {
  TabsV4Content,
  TabsV4List,
  TabsV4Root,
  TabsV4Trigger,
} from "@/components/ui/v4/Tabs";
import { MY_PRODUCTS_QUERY_KEY } from "@/hooks/useMyProducts";
import { SELLER_ORDERS_QUERY_KEY } from "@/hooks/useSellerOrders";
import { detectMiniPay } from "@/lib/minipay-detect";
import {
  fetchMyProducts,
  fetchMyProfile,
  fetchSellerOrders,
  type SellerProfilePublic,
} from "@/lib/seller-api";

// Block 5 sub-block 5.1 — "stake" tab dropped per ADR-041 V1 scope
// (stake retired, cross-border deferred V2). Five tabs remain.
//
// ADR-049 — `marketing` tab is gated behind
// NEXT_PUBLIC_ENABLE_MARKETING_TAB. V1 default `false` hides the
// 5-template marketing pack flow ; the photo-enhancement feature
// lives in the add-product dialog instead. The MarketingTab UI
// stays in the codebase for V1.5+ reactivation.
const MARKETING_TAB_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_MARKETING_TAB === "true";
const VALID_TABS = (
  MARKETING_TAB_ENABLED
    ? (["overview", "products", "orders", "profile", "marketing"] as const)
    : (["overview", "products", "orders", "profile"] as const)
);
type TabKey = (typeof VALID_TABS)[number];

export function SellerDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address } = useAccount();
  const queryClient = useQueryClient();

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

  // Pre-warm every tab's data cache as soon as we know the wallet, in
  // parallel with the seller-profile fetch above. The user reported
  // tab-switch lag : with this in place, by the time they tap any tab
  // the underlying TanStack Query already has data and the tab
  // renders synchronously off cache instead of firing a fresh
  // network request on every Radix Tabs mount.
  //
  // Each prefetchQuery's key MUST mirror the consumer hook's key
  // exactly (useMyProducts / useSellerOrders) ; otherwise the cache
  // entries are orphans and the consumer still fires.
  useEffect(() => {
    if (isMiniPay !== true || !address) return;
    void queryClient.prefetchQuery({
      queryKey: [...MY_PRODUCTS_QUERY_KEY, address, false],
      queryFn: () => fetchMyProducts(address, false),
      staleTime: 30_000,
    });
    void queryClient.prefetchQuery({
      // OrdersTab default : page 1, pageSize 20, no status filter.
      queryKey: [...SELLER_ORDERS_QUERY_KEY, address, 1, 20, ""],
      queryFn: () => fetchSellerOrders(address, 1, 20, undefined),
      staleTime: 30_000,
    });
    void queryClient.prefetchQuery({
      // Overview recent-orders strip : page 1, pageSize 5.
      queryKey: [...SELLER_ORDERS_QUERY_KEY, address, 1, 5, ""],
      queryFn: () => fetchSellerOrders(address, 1, 5, undefined),
      staleTime: 30_000,
    });
  }, [isMiniPay, address, queryClient]);

  const requestedTab = searchParams.get("tab");
  const safeTab: TabKey =
    requestedTab &&
    (VALID_TABS as readonly string[]).includes(requestedTab)
      ? (requestedTab as TabKey)
      : "overview";

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

  if (error === "not_found" && address) {
    return (
      <StatusShell>
        <OnboardingWizard
          walletAddress={address}
          onSuccess={(response) => {
            setProfile(response.profile);
            setError(null);
          }}
        />
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
            {MARKETING_TAB_ENABLED ? (
              <TabsV4Trigger value="marketing">Marketing</TabsV4Trigger>
            ) : null}
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
          {MARKETING_TAB_ENABLED ? (
            <TabsV4Content value="marketing">
              <MarketingTab />
            </TabsV4Content>
          ) : null}
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
