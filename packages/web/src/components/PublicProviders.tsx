/**
 * PublicProviders — DEPRECATED wrapper kept only so existing
 * imports compile. All providers have been hoisted to root
 * (`app/layout.tsx` → `AppProviders`) to prevent the dual-
 * WagmiProvider mount/unmount that bricked the dashboard via SPA
 * nav from `/` → `/seller/dashboard` (user-report 2026-05-24).
 *
 * This component is now a passthrough — kept for one release cycle
 * so any external consumer doesn't break, but the next cleanup pass
 * should remove it entirely along with the matching `Providers`
 * passthrough in `Providers.tsx`.
 */
"use client";

export function PublicProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
