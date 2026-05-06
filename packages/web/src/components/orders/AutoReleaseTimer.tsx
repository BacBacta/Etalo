/**
 * AutoReleaseTimer — live countdown to the buyer's auto-release
 * deadline. J11.5 Block 4.B.
 *
 * V1 intra orders auto-release 3 days after the seller marks an item
 * shipped (ADR-041 single timer). Once past, anyone can call
 * `triggerAutoReleaseForItem` permissionlessly — the timer flips to
 * a "ready to release" message instead of a countdown.
 *
 * Refreshes every 60 s via setInterval. The hook cleans up on unmount
 * and on `autoReleaseAt` change so React strict-mode double-mount
 * doesn't leak intervals.
 *
 * Returns null when `autoReleaseAt` is null (no shipment yet, no
 * timer to display).
 */
"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 60_000;

export interface AutoReleaseTimerProps {
  autoReleaseAt: Date | null;
  className?: string;
}

export function AutoReleaseTimer({
  autoReleaseAt,
  className,
}: AutoReleaseTimerProps) {
  // Initial render uses Date.now() ; subsequent re-renders are driven
  // by the interval tick.
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!autoReleaseAt) return;
    const id = setInterval(() => setNow(Date.now()), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoReleaseAt]);

  if (!autoReleaseAt) return null;

  const diffMs = autoReleaseAt.getTime() - now;
  const isElapsed = diffMs <= 0;

  return (
    <div
      role="status"
      data-testid="auto-release-timer"
      data-elapsed={isElapsed}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium",
        isElapsed
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
        className,
      )}
    >
      {isElapsed ? (
        <span>Auto-release window passed — funds can now be claimed</span>
      ) : (
        <>
          <span className="text-slate-500 dark:text-slate-400">
            Auto-release in
          </span>
          <span className="tabular-nums" data-testid="auto-release-countdown">
            {formatRemaining(diffMs)}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Format a positive ms remaining as a compact human label :
 *   > 24h : "2d 5h"
 *   1h-24h : "5h 12m"
 *   < 1h : "12m"
 *   < 1m : "<1m"
 *
 * Exported for unit testing.
 */
export function formatRemaining(diffMs: number): string {
  if (diffMs <= 0) return "0m";
  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 1) return "<1m";
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes - days * 60 * 24 - hours * 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
