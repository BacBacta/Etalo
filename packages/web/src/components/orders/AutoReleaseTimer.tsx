/**
 * AutoReleaseTimer — live countdown to the buyer's auto-release
 * deadline. J11.5 Block 4.B.
 *
 * V1 intra orders auto-release 3 days after the seller marks an item
 * shipped (ADR-041 single timer). Once past, anyone can call
 * `triggerAutoReleaseForItem` permissionlessly — the timer flips to
 * a "ready to release" message instead of a countdown.
 *
 * Implementation : thin wrapper around the generic `DeadlineCountdown`
 * primitive (extracted in Block C of the J12-pre reactivity sprint so
 * the N1 dispute window can reuse the same surface).
 *
 * Returns null when `autoReleaseAt` is null (no shipment yet, no
 * timer to display).
 */
"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 60_000;

export type DeadlineTone = "slate" | "rose" | "amber";

export interface DeadlineCountdownProps {
  /** When the deadline fires. Null disables rendering entirely. */
  deadline: Date | null;
  /** Static label shown before the duration ("Auto-release in", "Respond within"). */
  idleLabel: string;
  /** Single string shown once the deadline is past. */
  elapsedLabel: string;
  /** Visual tone. Slate = informational, amber = elapsed-but-OK, rose = action needed. */
  tone?: DeadlineTone;
  className?: string;
  testId?: string;
  /** Optional override for the inner duration span's data-testid.
   *  Kept distinct so legacy tests targeting "auto-release-countdown"
   *  keep working after the rename to the generic primitive. */
  valueTestId?: string;
}

const TONE_CLASSES: Record<DeadlineTone, { idle: string; elapsed: string }> = {
  slate: {
    idle: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    elapsed:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  },
  rose: {
    idle: "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
    elapsed:
      "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
  },
  amber: {
    idle: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
    elapsed:
      "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  },
};

/**
 * Generic 1Hz countdown pill. Re-renders every 60 s (cheap : single
 * setInterval, cleared on unmount + on `deadline` change so React
 * strict-mode double-mount doesn't leak intervals).
 *
 * a11y : `role="status"` only on the elapsed branch so the screen
 * reader doesn't re-announce the countdown each tick — see the
 * J11.5 Block 6 audit decision for context.
 */
export function DeadlineCountdown({
  deadline,
  idleLabel,
  elapsedLabel,
  tone = "slate",
  className,
  testId = "deadline-countdown",
  valueTestId,
}: DeadlineCountdownProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;

  const diffMs = deadline.getTime() - now;
  const isElapsed = diffMs <= 0;
  const toneClasses = TONE_CLASSES[tone];

  return (
    <div
      data-testid={testId}
      data-elapsed={isElapsed}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium",
        isElapsed ? toneClasses.elapsed : toneClasses.idle,
        className,
      )}
    >
      {isElapsed ? (
        <span role="status" aria-live="polite">
          {elapsedLabel}
        </span>
      ) : (
        <>
          <span className="opacity-70">{idleLabel}</span>
          <span
            className="tabular-nums"
            data-testid={valueTestId ?? `${testId}-value`}
          >
            {formatRemaining(diffMs)}
          </span>
        </>
      )}
    </div>
  );
}

export interface AutoReleaseTimerProps {
  autoReleaseAt: Date | null;
  className?: string;
}

export function AutoReleaseTimer({
  autoReleaseAt,
  className,
}: AutoReleaseTimerProps) {
  return (
    <DeadlineCountdown
      deadline={autoReleaseAt}
      idleLabel="Auto-release in"
      elapsedLabel="Auto-release window passed — funds can now be claimed"
      tone="slate"
      className={className}
      testId="auto-release-timer"
      valueTestId="auto-release-countdown"
    />
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
