"use client";

import { Bell, Package, ShoppingBag } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useNotifications } from "@/hooks/useNotifications";
import type { NotificationItem } from "@/lib/notifications/api";
import { formatRawUsdt } from "@/lib/usdt";

interface Props {
  address: string;
}

// Per-wallet "last opened the bell" timestamp (ms). Unread = notifications
// created after it. No read_at column on the model in V1, so we track it
// client-side (same approach as the Orders-tab new-order badge).
function lastSeenKey(address: string): string {
  return `etalo:notif:lastSeen:${address.toLowerCase()}`;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function describe(n: NotificationItem): {
  title: string;
  subtitle: string | null;
  icon: React.ReactNode;
} {
  if (n.notification_type === "order_funded") {
    const id = n.payload?.onchain_order_id;
    const amount =
      n.payload?.amount_usdt != null
        ? `${formatRawUsdt(n.payload.amount_usdt)} USDT`
        : null;
    return {
      title: "New order",
      subtitle: [id != null ? `#${id}` : null, amount]
        .filter(Boolean)
        .join(" · "),
      icon: <ShoppingBag className="h-4 w-4" weight="fill" aria-hidden />,
    };
  }
  // Generic fallback for future types (order_shipped, dispute_opened…).
  return {
    title: n.notification_type.replace(/_/g, " "),
    subtitle: null,
    icon: <Package className="h-4 w-4" weight="regular" aria-hidden />,
  };
}

export function NotificationBell({ address }: Props) {
  const { data } = useNotifications(address);
  const items = useMemo(() => data?.items ?? [], [data]);

  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Baseline on first mount: if we've never recorded a last-seen for this
  // wallet, set it to now so the seller's existing history doesn't show
  // up as a wall of "unread". New notifications after this count.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(lastSeenKey(address));
    if (stored === null) {
      const now = Date.now();
      window.localStorage.setItem(lastSeenKey(address), String(now));
      setLastSeen(now);
    } else {
      setLastSeen(Number(stored));
    }
  }, [address]);

  const unreadCount = useMemo(
    () =>
      items.filter((n) => new Date(n.created_at).getTime() > lastSeen).length,
    [items, lastSeen],
  );

  const markSeen = useCallback(() => {
    const now = Date.now();
    setLastSeen(now);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(lastSeenKey(address), String(now));
    }
  }, [address]);

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next) markSeen(); // opening clears the unread badge
      return next;
    });
  }, [markSeen]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-celo-dark hover:bg-celo-dark/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:text-celo-light dark:hover:bg-celo-light/10"
      >
        <Bell className="h-5 w-5" weight={unreadCount > 0 ? "fill" : "regular"} />
        {unreadCount > 0 ? (
          <span
            aria-hidden
            className="absolute right-1 top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-celo-forest px-1 py-0.5 text-sm font-semibold leading-none text-white dark:bg-celo-green dark:text-celo-dark"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-celo-light/10 dark:bg-celo-dark-elevated"
        >
          <div className="border-b border-neutral-100 px-4 py-3 dark:border-celo-light/10">
            <h2 className="text-base font-semibold text-celo-dark dark:text-celo-light">
              Notifications
            </h2>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-celo-light/60">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-neutral-100 overflow-y-auto dark:divide-celo-light/10">
              {items.map((n) => {
                const { title, subtitle, icon } = describe(n);
                return (
                  <li key={n.id}>
                    <Link
                      href="/seller/dashboard?tab=orders"
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-neutral-50 focus-visible:outline-none focus-visible:bg-neutral-50 dark:hover:bg-celo-dark-bg dark:focus-visible:bg-celo-dark-bg"
                    >
                      <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-celo-forest-soft text-celo-forest dark:bg-celo-forest-bright-soft dark:text-celo-forest-bright">
                        {icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium capitalize text-celo-dark dark:text-celo-light">
                          {title}
                        </span>
                        {subtitle ? (
                          <span className="block text-sm tabular-nums text-neutral-600 dark:text-celo-light/70">
                            {subtitle}
                          </span>
                        ) : null}
                        <span className="block text-sm text-neutral-400 dark:text-celo-light/50">
                          {timeAgo(n.created_at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
