/**
 * Vitest specs for CartDrawer's swipe-to-close threshold logic.
 * J10-V5 Phase 5 Block 2 sub-block 2.2.
 *
 * The drawer slides out from the right; a rightward swipe (positive
 * offset.x) past 100 px OR a fast flick past 500 px/s velocity calls
 * onOpenChange(false). Below either threshold, motion's dragSnapToOrigin
 * animates the drawer back to its resting position — no close.
 *
 * We test the pure threshold helper directly. Motion's drag-event
 * detection is the library's responsibility; jsdom can't simulate the
 * pointer-capture sequence faithfully, so live MiniPay validation in
 * sub-block 2.4 remains the source of truth for the gesture itself.
 */
import { describe, expect, it } from "vitest";

import {
  DRAG_CLOSE_THRESHOLD_PX,
  DRAG_CLOSE_VELOCITY_PX_PER_SEC,
  shouldCloseOnSwipe,
} from "@/components/CartDrawer";

describe("CartDrawer — shouldCloseOnSwipe (Phase 5 Block 2 sub-block 2.2)", () => {
  it("closes when rightward offset exceeds the distance threshold", () => {
    expect(
      shouldCloseOnSwipe({
        offset: { x: DRAG_CLOSE_THRESHOLD_PX + 1 },
        velocity: { x: 0 },
      }),
    ).toBe(true);
  });

  it("closes on a fast rightward flick even with small offset", () => {
    expect(
      shouldCloseOnSwipe({
        offset: { x: 20 },
        velocity: { x: DRAG_CLOSE_VELOCITY_PX_PER_SEC + 1 },
      }),
    ).toBe(true);
  });

  it("snaps back when both offset and velocity are below threshold", () => {
    expect(
      shouldCloseOnSwipe({
        offset: { x: DRAG_CLOSE_THRESHOLD_PX - 1 },
        velocity: { x: DRAG_CLOSE_VELOCITY_PX_PER_SEC - 1 },
      }),
    ).toBe(false);
  });

  it("ignores leftward drags (negative offset/velocity, into the screen)", () => {
    expect(
      shouldCloseOnSwipe({
        offset: { x: -300 },
        velocity: { x: -1500 },
      }),
    ).toBe(false);
  });
});
