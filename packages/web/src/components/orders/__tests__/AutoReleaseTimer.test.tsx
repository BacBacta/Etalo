/**
 * AutoReleaseTimer — J11.5 Block 4.B.
 *
 * Time-bound rendering covered with vi.useFakeTimers so transitions
 * are deterministic. formatRemaining() is unit-tested in isolation
 * for clean coverage of the duration buckets.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AutoReleaseTimer,
  formatRemaining,
} from "@/components/orders/AutoReleaseTimer";

describe("formatRemaining", () => {
  it("returns 0m when diff is non-positive", () => {
    expect(formatRemaining(0)).toBe("0m");
    expect(formatRemaining(-1)).toBe("0m");
  });

  it("returns <1m for sub-minute remaining", () => {
    expect(formatRemaining(30_000)).toBe("<1m");
  });

  it("returns Xm for under one hour", () => {
    expect(formatRemaining(15 * 60_000)).toBe("15m");
    expect(formatRemaining(59 * 60_000)).toBe("59m");
  });

  it("returns Xh Ym for one to twenty-four hours", () => {
    expect(formatRemaining(60 * 60_000)).toBe("1h 0m");
    expect(formatRemaining(5 * 60 * 60_000 + 12 * 60_000)).toBe("5h 12m");
    expect(formatRemaining(23 * 60 * 60_000 + 59 * 60_000)).toBe("23h 59m");
  });

  it("returns Xd Yh for one or more days", () => {
    expect(formatRemaining(24 * 60 * 60_000)).toBe("1d 0h");
    expect(
      formatRemaining(2 * 24 * 60 * 60_000 + 5 * 60 * 60_000),
    ).toBe("2d 5h");
  });
});

describe("AutoReleaseTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when autoReleaseAt is null", () => {
    const { container } = render(<AutoReleaseTimer autoReleaseAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders countdown when deadline is in the future", () => {
    // 5 hours 30 min ahead
    const target = new Date("2026-05-04T17:30:00Z");
    render(<AutoReleaseTimer autoReleaseAt={target} />);

    const timer = screen.getByTestId("auto-release-timer");
    expect(timer).toHaveAttribute("data-elapsed", "false");
    expect(screen.getByTestId("auto-release-countdown")).toHaveTextContent(
      "5h 30m",
    );
  });

  it("flips to elapsed message after deadline passes", () => {
    // 1 minute ahead — about to elapse
    const target = new Date("2026-05-04T12:01:00Z");
    render(<AutoReleaseTimer autoReleaseAt={target} />);

    expect(screen.getByTestId("auto-release-timer")).toHaveAttribute(
      "data-elapsed",
      "false",
    );

    // Advance 2 minutes — the interval fires, state updates.
    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });

    expect(screen.getByTestId("auto-release-timer")).toHaveAttribute(
      "data-elapsed",
      "true",
    );
    expect(
      screen.getByText(/Auto-release window passed/i),
    ).toBeInTheDocument();
  });

  it("renders elapsed message when deadline already past on mount", () => {
    const target = new Date("2026-05-03T12:00:00Z"); // 1d ago
    render(<AutoReleaseTimer autoReleaseAt={target} />);

    expect(screen.getByTestId("auto-release-timer")).toHaveAttribute(
      "data-elapsed",
      "true",
    );
  });

  it("countdown updates as time advances (1 minute interval)", () => {
    const target = new Date("2026-05-04T13:00:00Z"); // 60 minutes ahead
    render(<AutoReleaseTimer autoReleaseAt={target} />);

    expect(screen.getByTestId("auto-release-countdown")).toHaveTextContent(
      "1h 0m",
    );

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByTestId("auto-release-countdown")).toHaveTextContent(
      "59m",
    );
  });
});
