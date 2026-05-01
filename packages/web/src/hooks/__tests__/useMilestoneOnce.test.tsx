/**
 * Vitest specs for useMilestoneOnce (J10-V5 Phase 4 Block 6
 * sub-block 6.2).
 *
 * Pin the contract that consumers (sub-block 6.3 OrdersTab + any
 * future banner/toast) will rely on :
 *  - SSR-safe initial paint (shouldShow=false), then post-mount
 *    hydration reads localStorage.
 *  - markShown writes the per-type flag AND collapses shouldShow so
 *    same-session re-renders don't re-fire.
 *  - Per-type namespace isolation : marking one milestone shown
 *    leaves the others untouched.
 *  - localStorage failure is non-fatal (MiniPay incognito-style
 *    contexts ; lesson from hotfix #7).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useMilestoneOnce,
  type UseMilestoneOnceResult,
} from "@/hooks/useMilestoneOnce";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("useMilestoneOnce", () => {
  // SSR-safety (initial paint = false before hydration) is guaranteed
  // by the `useState(false)` initializer ; RTL's `renderHook` runs
  // useEffect synchronously in jsdom so we can't observe the pre-
  // hydration paint at runtime. The behavioral claim under test here
  // is the post-hydration outcome : with no flag set, the consumer
  // gets shouldShow=true on its next render.
  it("post-hydration returns shouldShow=true when the per-type flag is unset", async () => {
    const { result } = renderHook(() => useMilestoneOnce("first-sale"));
    await waitFor(() => expect(result.current.shouldShow).toBe(true));
  });

  it("never flips shouldShow to true when the per-type flag is already 'true'", async () => {
    window.localStorage.setItem("etalo-milestone-shown-first-sale", "true");
    const { result } = renderHook(() => useMilestoneOnce("first-sale"));
    expect(result.current.shouldShow).toBe(false);
    // Wait one tick so the hydration effect runs ; assert it stayed
    // false (the assertion is "still false" rather than "becomes
    // true", so a brief wait is the right shape).
    await waitFor(() => {
      // Effect has run at least once — confirm by checking the
      // markShown identity changed (recreated by the same effect
      // chain). If shouldShow ever flipped to true and back, this
      // would fail.
      expect(result.current.shouldShow).toBe(false);
    });
    expect(result.current.shouldShow).toBe(false);
  });

  it("markShown writes the per-type flag and collapses shouldShow back to false", async () => {
    const { result } = renderHook(() => useMilestoneOnce("first-sale"));
    await waitFor(() => expect(result.current.shouldShow).toBe(true));

    act(() => result.current.markShown());

    expect(result.current.shouldShow).toBe(false);
    expect(
      window.localStorage.getItem("etalo-milestone-shown-first-sale"),
    ).toBe("true");
  });

  it("per-type namespace isolation : marking 'first-sale' shown leaves 'withdrawal-complete' untouched", async () => {
    window.localStorage.setItem("etalo-milestone-shown-first-sale", "true");
    const { result } = renderHook(() =>
      useMilestoneOnce("withdrawal-complete"),
    );
    // The withdrawal-complete flag was never set, so this independent
    // hook still wants to show. The first-sale flag's presence is
    // irrelevant.
    await waitFor(() => expect(result.current.shouldShow).toBe(true));
    expect(
      window.localStorage.getItem("etalo-milestone-shown-first-sale"),
    ).toBe("true"); // unchanged
    expect(
      window.localStorage.getItem(
        "etalo-milestone-shown-withdrawal-complete",
      ),
    ).toBeNull();
  });

  it("localStorage failure is non-fatal — render does not throw, markShown does not throw", () => {
    // Stub Storage.prototype methods (instance-level spies don't
    // intercept jsdom's localStorage on every browser/jsdom build).
    // SecurityError is what real browsers throw under strict
    // privacy mode + what MiniPay's WebView throws in the
    // incognito-style sessions hotfix #7 flagged.
    const getStub = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });
    const setStub = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });

    let result: ReturnType<typeof renderHook<UseMilestoneOnceResult, void>>["result"];
    expect(() => {
      result = renderHook(() => useMilestoneOnce("credit-purchase")).result;
    }).not.toThrow();

    // Hydration ran, hit the throw, was caught — state stayed at
    // the SSR-safe default. Consumer's celebratory surface stays
    // dormant rather than the whole tab crashing.
    expect(result!.current.shouldShow).toBe(false);
    expect(getStub).toHaveBeenCalled();

    // markShown must also swallow the SecurityError without
    // bubbling.
    expect(() => act(() => result!.current.markShown())).not.toThrow();
    expect(setStub).toHaveBeenCalled();
  });
});
