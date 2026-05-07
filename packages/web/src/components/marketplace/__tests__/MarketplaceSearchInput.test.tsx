/**
 * Vitest specs for MarketplaceSearchInput — fix/marketplace-ux-pass.
 *
 * The input is the only debounced surface in /marketplace ; the URL
 * state writer (router.replace) gets hit at most once per ~300 ms of
 * typing instead of once per keystroke. These specs lock in :
 *  - typing flushes the debounced value to onChange after the timeout
 *  - the clear button empties immediately (no debounce on clear)
 *  - external value changes (URL deeplink) sync into the local input
 */
import { fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { MarketplaceSearchInput } from "@/components/marketplace/MarketplaceSearchInput";

describe("MarketplaceSearchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces flush of typed value to onChange", () => {
    const onChange = vi.fn();
    render(
      <MarketplaceSearchInput
        value=""
        onChange={onChange}
        debounceMs={300}
      />,
    );
    const input = screen.getByTestId(
      "marketplace-search-input",
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "robe" } });
    // Immediately after the change, the debounce timer is in flight ;
    // onChange has not been called yet.
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("robe");
  });

  it("collapses fast multi-keystroke into a single onChange after debounce", () => {
    const onChange = vi.fn();
    render(
      <MarketplaceSearchInput
        value=""
        onChange={onChange}
        debounceMs={300}
      />,
    );
    const input = screen.getByTestId(
      "marketplace-search-input",
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "r" } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: "ro" } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: "rob" } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: "robe" } });
    // Only the final value should fire after debounce.
    vi.advanceTimersByTime(301);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("robe");
  });

  it("clear button empties the input + fires onChange immediately (no debounce on clear)", () => {
    const onChange = vi.fn();
    render(
      <MarketplaceSearchInput
        value="robe"
        onChange={onChange}
        debounceMs={300}
      />,
    );
    const clear = screen.getByTestId("marketplace-search-clear");
    fireEvent.click(clear);
    // onChange("") fires synchronously on click (the user's clear
    // intent is unambiguous, no need to wait).
    expect(onChange).toHaveBeenCalledWith("");
    const input = screen.getByTestId(
      "marketplace-search-input",
    ) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("hides the clear button when local value is empty", () => {
    render(
      <MarketplaceSearchInput value="" onChange={vi.fn()} debounceMs={300} />,
    );
    expect(screen.queryByTestId("marketplace-search-clear")).toBeNull();
  });

  it("syncs external value changes into the local input (URL deeplink hydration)", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MarketplaceSearchInput value="" onChange={onChange} debounceMs={300} />,
    );
    rerender(
      <MarketplaceSearchInput
        value="robe"
        onChange={onChange}
        debounceMs={300}
      />,
    );
    const input = screen.getByTestId(
      "marketplace-search-input",
    ) as HTMLInputElement;
    expect(input.value).toBe("robe");
    // External-driven value change must NOT trigger a re-flush back to
    // the parent (would create a feedback loop with URL state).
    vi.advanceTimersByTime(500);
    expect(onChange).not.toHaveBeenCalled();
  });
});
