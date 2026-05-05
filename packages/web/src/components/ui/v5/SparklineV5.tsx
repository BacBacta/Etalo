/**
 * SparklineV5 — V5 minimal trend line for product cards, KPI sparks,
 * etc. (J10-V5 Phase 3 Block 4). Lazy-loads SparklineV5Inner via
 * next/dynamic (ssr: false) so unused routes pay zero recharts cost.
 * SkeletonV5 fallback uses a tight rectangle matching the sparkline
 * footprint to avoid layout shift on hydration.
 */
"use client";

import dynamic from "next/dynamic";

import { SkeletonV5 } from "@/components/ui/v5/Skeleton";

import type { SparklineV5InnerProps } from "./SparklineV5Inner";

export type { SparklineV5Variant } from "./SparklineV5Inner";

const SparklineV5Lazy = dynamic(() => import("./SparklineV5Inner"), {
  ssr: false,
  loading: () => (
    <SkeletonV5
      variant="rectangle"
      className="h-6 w-20"
      aria-label="Loading sparkline"
    />
  ),
});

export function SparklineV5(props: SparklineV5InnerProps) {
  return <SparklineV5Lazy {...props} />;
}
