/**
 * Vitest specs for ChartLineV5Inner (J10-V5 Phase 3 Block 4).
 *
 * Targets the Inner component directly — the public ChartLineV5
 * wrapper relies on next/dynamic which doesn't resolve under jsdom.
 * Recharts' ResponsiveContainer requires ResizeObserver, which jsdom
 * does not implement; stubbed here.
 */
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import ChartLineV5Inner, {
  CHART_LINE_COLOR_MAP,
  type ChartLineV5Datum,
} from "@/components/ui/v5/ChartLineV5Inner";

beforeAll(() => {
  // Recharts ResponsiveContainer needs ResizeObserver. jsdom doesn't ship
  // one, so stub a no-op.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
});

const SAMPLE_DATA: ChartLineV5Datum[] = [
  { label: "Mon", value: 120 },
  { label: "Tue", value: 145 },
  { label: "Wed", value: 132 },
  { label: "Thu", value: 178 },
  { label: "Fri", value: 210 },
];

describe("ChartLineV5Inner", () => {
  it("renders the chart root with provided data + default forest stroke", () => {
    render(<ChartLineV5Inner data={SAMPLE_DATA} />);
    const root = screen.getByTestId("chart-line-root");
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("data-color", "celo-forest");
    expect(root).toHaveAttribute("data-stroke", CHART_LINE_COLOR_MAP["celo-forest"]);
  });

  it("renders the empty fallback when data is []", () => {
    render(<ChartLineV5Inner data={[]} />);
    const empty = screen.getByTestId("chart-line-empty");
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent(/No data yet/i);
    expect(screen.queryByTestId("chart-line-root")).not.toBeInTheDocument();
  });

  it("respects color override prop (yellow / red / blue)", () => {
    const overrides = ["celo-yellow", "celo-red", "celo-blue"] as const;
    for (const color of overrides) {
      const { unmount } = render(
        <ChartLineV5Inner data={SAMPLE_DATA} color={color} />,
      );
      const root = screen.getByTestId("chart-line-root");
      expect(root).toHaveAttribute("data-color", color);
      expect(root).toHaveAttribute("data-stroke", CHART_LINE_COLOR_MAP[color]);
      unmount();
    }
  });

  it("respects custom height prop on the chart container", () => {
    render(<ChartLineV5Inner data={SAMPLE_DATA} height={320} />);
    const root = screen.getByTestId("chart-line-root");
    expect(root).toHaveStyle({ height: "320px" });
  });

  it("color map contains all 4 documented V5 tokens with hex values", () => {
    expect(CHART_LINE_COLOR_MAP["celo-forest"]).toBe("#476520");
    expect(CHART_LINE_COLOR_MAP["celo-yellow"]).toBe("#FBCC5C");
    expect(CHART_LINE_COLOR_MAP["celo-red"]).toBe("#A8362F");
    expect(CHART_LINE_COLOR_MAP["celo-blue"]).toBe("#1E88E5");
  });
});
