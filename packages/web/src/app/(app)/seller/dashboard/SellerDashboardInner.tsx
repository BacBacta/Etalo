"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import dynamic from "next/dynamic";

import { DashboardSkeleton } from "@/app/(app)/seller/dashboard/DashboardSkeleton";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { CreateShopForm } from "@/components/seller/CreateShopForm";
import { OverviewTab } from "@/components/seller/OverviewTab";
import { CreditsChip } from "@/components/seller/CreditsChip";
import { ProfileTab } from "@/components/seller/ProfileTab";
import { AnimateIn } from "@/components/ui/v5/AnimateIn";
import { NotificationBell } from "@/components/NotificationBell";
import { useMinipay } from "@/hooks/useMinipay";
import { useNewSellerOrderAlerts } from "@/hooks/useNewSellerOrderAlerts";

// Phase A P0-2 (2026-05-15) — bundle reduction. The dashboard's eager
// First Load JS was 276 kB (perf score 27). Three of these imports
// (MarketingTab, OrdersTab, ProductsTab) only render based on tab
// selection — perfect lazy candidates. Overview + Profile stay eager
// because Overview is the default landing tab and Profile is the
// second-priority tab (Mike's audit J10-V5 Phase 5 Track 2 fix #2).
// Loading fallback null because the parent Suspense /
// DashboardSkeleton already covers first paint and tab switches are
// user-initiated.
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
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  // CLAUDE.md rule 7 / MiniPay best practices : inside MiniPay we must
  // never surface a Connect Wallet button. `useMinipay()` kicks the
  // auto-connect via the lenient detection (real MiniPay + Test mode)
  // and tells us whether we're rendering inside a MiniPay context so
  // we can show "Connecting to MiniPay…" instead of the Chrome-style
  // manual Connect prompt.
  const {
    isInMinipay,
    connectFailed: minipayConnectFailed,
    retry: retryMinipayConnect,
  } = useMinipay();

  const [profile, setProfile] = useState<SellerProfilePublic | null>(null);
  const [error, setError] = useState<"not_found" | "fetch_failed" | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // Last-known address shadow (production bug 2026-05-23). wagmi
  // sometimes briefly reports `isConnected=true, address=undefined`
  // when EIP-6963 discovery adds a connector mid-session. Children
  // (OverviewTab, ProductsTab, OrdersTab, ProfileTab) all need a
  // stable string address — the shadow ref keeps the last valid
  // value across the transient so child queries don't refetch with
  // `undefined` and lose their data.
  const lastAddressRef = useRef<string | null>(null);
  if (address) lastAddressRef.current = address;
  const stableAddress = address ?? lastAddressRef.current;

  // ADR-052/053 — dashboard access is gated on wallet connection, NOT
  // on MiniPay context. Chrome users with a connected wallet see their
  // dashboard ; otherwise we show a Connect-wallet prompt inside the
  // dashboard shell instead of bouncing them back to `/`.

  // Identity fetch (/sellers/me). Block 5 sub-block 5.4 dropped the
  // parallel `fetchSellerOnchainProfile` call — its only consumers were
  // StakeTab (retired in 5.1) and OverviewTab's stake StatCards (also
  // retired in 5.1). The dashboard's KPI surface now sources its
  // numbers from useAnalyticsSummary (sub-block 5.3) directly inside
  // OverviewTab, so the parent only needs the off-chain identity row.
  useEffect(() => {
    if (!isConnected) {
      // Truly disconnected — clear loading so the disconnected UI
      // shows immediately.
      setLoading(false);
      return;
    }
    if (!address) {
      // wagmi address transient (PR #65) — wagmi sometimes briefly
      // loses `address` while still reporting `isConnected=true`
      // when EIP-6963 discovery adds a new connector mid-session
      // (e.g. `com.opera.minipay` appearing alongside the statically-
      // configured `minipay`). Do NOT clobber the existing profile /
      // loading state — the next dep tick re-fires the effect with
      // a real address. The render gate below tolerates this via the
      // `!address && !profile` check so the user keeps seeing cached
      // dashboard data instead of bouncing back to a skeleton.
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Watchdog : if /sellers/me takes more than 10 s flip to
    // `fetch_failed` so the user sees Retry instead of a perma-skeleton.
    const watchdog = window.setTimeout(() => {
      if (cancelled) return;
      setError("fetch_failed");
      setLoading(false);
    }, 10_000);
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
        window.clearTimeout(watchdog);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [isConnected, address]);

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
    if (!isConnected || !address) return;
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
  }, [isConnected, address, queryClient]);

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

  // Proactive new-order signal — toasts on arrival + a count badge on the
  // Orders tab when a fresh order lands while the seller is elsewhere in
  // the app. Reuses the polled orders cache (no extra request). Cleared
  // when the seller opens the Orders tab (they've now seen them).
  const { newCount: newOrderCount, markSeen: markOrdersSeen } =
    useNewSellerOrderAlerts(stableAddress);
  useEffect(() => {
    if (safeTab === "orders") markOrdersSeen();
  }, [safeTab, markOrdersSeen]);

  if (minipayConnectFailed) {
    return (
      <StatusShell>
        <div className="mx-auto max-w-md py-12 text-center">
          <p className="mb-4 text-base text-celo-dark dark:text-celo-light">
            Couldn&apos;t connect to MiniPay.
          </p>
          <button
            type="button"
            onClick={retryMinipayConnect}
            className="min-h-[44px] px-4 text-base underline"
          >
            Retry
          </button>
        </div>
      </StatusShell>
    );
  }

  // SKELETON-TRAP REMOVAL (production bug 2026-05-24) — the previous
  // gate here fired `<DashboardSkeleton />` whenever wagmi reported
  // `accountStatus === "reconnecting" | "connecting"` OR our internal
  // `minipayConnecting`. The motivation was to mask the brief flash
  // of the disconnected-state UI during a healthy reconnect (~50 ms).
  // But it created a perpetual-skeleton trap : when wagmi gets stuck
  // in "connecting" (MetaMask popup left open, MiniPay WebView slow,
  // or an EIP-6963 race that never resolves), the Skeleton stays
  // forever with NO escape — the user can't reach the Connect button
  // because the skeleton covers it.
  //
  // Resolution : let gate 3 (`!isConnected || (!address && !profile)`)
  // handle the disconnected/in-flight states. In MiniPay it renders
  // "Connecting to MiniPay…" text (with a watchdog-driven Retry at
  // 8 s). On Chrome it renders the Connect prompt with a working
  // button. Either is recoverable ; the perpetual skeleton wasn't.
  // The brief disconnected-UI flash during a healthy connect (~50 ms)
  // is the acceptable cost.

  // Gate condition refined : tolerate the wagmi `address` transient
  // (production bug 2026-05-23). When EIP-6963 connector discovery
  // adds `com.opera.minipay` after the initial handshake, wagmi
  // briefly emits `isConnected=true, address=undefined`. Without this
  // tolerance the gate hit `!address` and dropped the user back to
  // the disconnected-state UI (skeleton) — losing the in-progress
  // fetch + the rendered dashboard. With `&& !profile` we only fall
  // back to the disconnected UI when we have NO cached data to show.
  // If profile is loaded, we render the dashboard normally and the
  // next dep-tick (when address comes back) will refresh.
  if (!isConnected || (!address && !profile)) {
    if (isInMinipay) {
      // Zero-click contract : the useMinipay() auto-connect side-
      // effect is in flight. Skeleton until it resolves — NO button,
      // NO prompt text. Per MiniPay requirements doc §1 + CLAUDE.md
      // rule 7.
      return <DashboardSkeleton />;
    }

    // Outside MiniPay (Chrome / mobile browser, no auto-connect
    // possible). Manual Connect prompt — the user has to opt in
    // explicitly so we don't pop a wallet permission dialog on first
    // paint.
    return (
      <StatusShell>
        <div className="mx-auto max-w-md py-12 text-center">
          <h2 className="mb-3 text-xl font-semibold text-celo-dark dark:text-celo-light">
            Connect your wallet to open your boutique
          </h2>
          <p className="mb-4 text-base text-neutral-700 dark:text-celo-light/70">
            Your seller dashboard is tied to the wallet that owns the
            shop — connect to see your products, orders, and revenue.
          </p>
          <div className="flex justify-center">
            <ConnectWalletButton />
          </div>
        </div>
      </StatusShell>
    );
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error === "not_found" && stableAddress) {
    // Self-service shop creation. Single-page premium wizard — the
    // boutique can ship with zero products (backend `first_product` is
    // optional on `/onboarding/complete`). On success we drop the
    // freshly-created profile into local state and clear the error —
    // the same render path then falls through to the regular dashboard
    // below, no page reload required.
    return (
      <main id="main" className="min-h-screen">
        <CreateShopForm
          walletAddress={stableAddress as string}
          onCreated={(created) => {
            setProfile(created);
            setError(null);
          }}
        />
      </main>
    );
  }

  if (error === "fetch_failed" || !profile || !stableAddress) {
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
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="mb-1 text-xl font-semibold">Your shop</h1>
            <p className="text-sm text-neutral-600">@{profile.shop_handle}</p>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell address={stableAddress as string} />
            <CreditsChip />
          </div>
        </div>

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
            <TabsV4Trigger value="orders">
              <span className="inline-flex items-center gap-1.5">
                Orders
                {newOrderCount > 0 ? (
                  <span
                    aria-label={`${newOrderCount} new ${newOrderCount === 1 ? "order" : "orders"}`}
                    className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-celo-forest px-1.5 py-0.5 text-sm font-semibold leading-none text-white dark:bg-celo-green dark:text-celo-dark"
                  >
                    {newOrderCount}
                  </span>
                ) : null}
              </span>
            </TabsV4Trigger>
            {MARKETING_TAB_ENABLED ? (
              <TabsV4Trigger value="marketing">Marketing</TabsV4Trigger>
            ) : null}
          </TabsV4List>

          {/* Each tab's content slides in on switch (AnimateIn). Radix
              unmounts the inactive content, so switching tabs remounts
              the new one and replays the entrance — the dashboard feels
              alive instead of snapping between static panels. */}
          <TabsV4Content value="overview">
            <AnimateIn>
              <OverviewTab profile={profile} address={stableAddress as string} />
            </AnimateIn>
          </TabsV4Content>
          <TabsV4Content value="products">
            <AnimateIn>
              <ProductsTab profile={profile} walletAddress={stableAddress as string} />
            </AnimateIn>
          </TabsV4Content>
          <TabsV4Content value="orders">
            <AnimateIn>
              <OrdersTab address={stableAddress as string} />
            </AnimateIn>
          </TabsV4Content>
          <TabsV4Content value="profile">
            <AnimateIn>
              <ProfileTab
                profile={profile}
                address={stableAddress as string}
                onUpdated={setProfile}
              />
            </AnimateIn>
          </TabsV4Content>
          {MARKETING_TAB_ENABLED ? (
            <TabsV4Content value="marketing">
              <AnimateIn>
                <MarketingTab />
              </AnimateIn>
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
