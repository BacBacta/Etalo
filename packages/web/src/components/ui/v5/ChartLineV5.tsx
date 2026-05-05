/**
 * ChartLineV5 — V5 line chart with celo palette tokens (J10-V5 Phase 3
 * Block 4). Lazy-loads the recharts-backed inner component via
 * next/dynamic (ssr: false) so consumers that never render the chart
 * pay zero recharts cost in their per-route bundle. The Skeleton
 * fallback covers the brief load window.
 */
"use client";

import dynamic from "next/dynamic";

import { SkeletonV5 } from "@/components/ui/v5/Skeleton";

import type { ChartLineV5InnerProps } from "./ChartLineV5Inner";

export type { ChartLineV5Datum } from "./ChartLineV5Inner";

const ChartLineV5Lazy = dynamic(() => import("./ChartLineV5Inner"), {
  ssr: false,
  loading: () => <SkeletonV5 variant="card" />,
});

export function ChartLineV5(props: ChartLineV5InnerProps) {
  return <ChartLineV5Lazy {...props} />;
}
