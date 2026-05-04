/**
 * Pull-to-refresh constants + threshold helper for MarketplacePage
 * (J10-V5 Phase 5 Block 2 sub-block 2.3b).
 *
 * Lives next to page.tsx instead of inside it because Next.js's App
 * Router only allows specific named exports (default / metadata /
 * generateMetadata / etc.) from page.tsx files. Co-locating the helpers
 * here keeps the gesture logic adjacent without tripping that
 * constraint, and lets the spec import them directly.
 */

// 80 px past resistance triggers refetch ; matches iOS / Android sheet
// dismissal conventions. Tweaking this value shifts the gesture's
// "tightness" — lower = easier to trigger, higher = stricter.
export const PULL_TO_REFRESH_THRESHOLD_PX = 80;

// 0.5 visual resistance gives the rubber-band feel : 200 px finger drag
// → 100 px visual translation. Anything more rigid (e.g. 1.0) feels
// heavy ; lower values (e.g. 0.3) make the indicator outrun the finger.
export const PULL_RESISTANCE = 0.5;

// Cap on visible pull translation. Stops the indicator from drifting
// off-screen if the user keeps pulling far past the threshold.
export const PULL_VISUAL_CAP_PX = 200;

export function shouldTriggerRefreshOnRelease(pullDistance: number): boolean {
  return pullDistance >= PULL_TO_REFRESH_THRESHOLD_PX;
}
