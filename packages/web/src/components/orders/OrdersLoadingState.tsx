/**
 * OrdersLoadingState — skeleton placeholder rows for the buyer order
 * list while the TanStack Query is fetching.
 * J11.5 Block 3.D.
 *
 * Renders 3 row-variant SkeletonV5 blocks — enough to fill the
 * mobile viewport above the fold without cumulative-layout-shift
 * surprises when the real cards land.
 */
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";

const PLACEHOLDER_COUNT = 3;

export function OrdersLoadingState() {
  return (
    <div
      data-testid="orders-loading-state"
      className="flex flex-col gap-3"
    >
      {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
        <SkeletonV5
          key={i}
          variant="row"
          className="h-[68px] rounded-lg border border-slate-200 px-4 py-3 dark:border-celo-dark-surface"
        />
      ))}
    </div>
  );
}
