/**
 * Vitest specs for SparklineV5Inner (J10-V5 Phase 3 Block 4).
 *
 * Targets the Inner component directly — SparklineV5 wrapper uses
 * next/dynamic which doesn't resolve under jsdom. Recharts'
 * ResponsiveContainer requires ResizeObserver, stubbed here.
 */
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import SparklineV5Inner, {
  resolveSparklineColor,
  SPARKLINE_COLOR_MAP,
  SPARKLINE_FLAT_COLOR,
} from "@/components/ui/v5/SparklineV5Inner";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
});

describe("SparklineV5Inner", () => {
  it("renders the sparkline root with default forest stroke", () => {
    render(<SparklineV5Inner data={[1, 2, 3, 4, 5]} />);
    const root = screen.getByTestId("sparkline-root");
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("data-stroke", SPARKLINE_COLOR_MAP["celo-forest"]);
  });

  it("trend variant resolves to forest when ascending, red when descending, flat-grey when flat", () => {
    expect(resolveSparklineColor([1, 2, 3, 4], "trend", "celo-forest")).toBe(
      SPARKLINE_COLOR_MAP["celo-forest"],
    );
    expect(resolveSparklineColor([4, 3, 2, 1], "trend", "celo-forest")).toBe(
      SPARKLINE_COLOR_MAP["celo-red"],
    );
    expect(resolveSparklineColor([5, 5, 5, 5], "trend", "celo-forest")).toBe(
      SPARKLINE_FLAT_COLOR,
    );
  });

  it("default variant honors the explicit color prop", () => {
    render(
      <SparklineV5Inner data={[5, 4, 3, 2, 1]} color="celo-yellow" />,
    );
    const root = screen.getByTestId("sparkline-root");
    expect(root).toHaveAttribute("data-stroke", SPARKLINE_COLOR_MAP["celo-yellow"]);
  });

  it("trend variant overrides the color prop based on data direction", () => {
    // Even though caller passes celo-yellow, descending data → red.
    render(
      <SparklineV5Inner
        data={[10, 8, 6, 4]}
        color="celo-yellow"
        variant="trend"
      />,
    );
    const root = screen.getByTestId("sparkline-root");
    expect(root).toHaveAttribute("data-stroke", SPARKLINE_COLOR_MAP["celo-red"]);
  });

  it("respects custom width and height props", () => {
    render(<SparklineV5Inner data={[1, 2, 3]} width={120} height={36} />);
    const root = screen.getByTestId("sparkline-root");
    expect(root).toHaveStyle({ width: "120px", height: "36px" });
  });
});
