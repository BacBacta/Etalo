/**
 * SparklineV5Inner — minimal recharts line for product cards / KPI
 * surfaces (J10-V5 Phase 3 Block 4). No axes, no grid, no tooltip —
 * pure trend visualization. Lazy-imported via SparklineV5.tsx
 * (next/dynamic ssr:false) so the recharts chunk only loads on
 * surfaces that actually render a sparkline.
 */
import { Line, LineChart, ResponsiveContainer } from "recharts";

const COLOR_MAP: Record<string, string> = {
  "celo-forest": "#476520",
  "celo-yellow": "#FBCC5C",
  "celo-red": "#A8362F",
  "celo-blue": "#1E88E5",
};

const FLAT_COLOR = "rgba(46,51,56,0.4)"; // celo-dark/40

export type SparklineV5Variant = "default" | "trend";

export interface SparklineV5InnerProps {
  data: number[];
  color?: keyof typeof COLOR_MAP;
  width?: number;
  height?: number;
  variant?: SparklineV5Variant;
}

export function resolveSparklineColor(
  data: number[],
  variant: SparklineV5Variant,
  fallback: keyof typeof COLOR_MAP,
): string {
  if (variant === "trend" && data.length >= 2) {
    const first = data[0];
    const last = data[data.length - 1];
    if (last > first) return COLOR_MAP["celo-forest"];
    if (last < first) return COLOR_MAP["celo-red"];
    return FLAT_COLOR;
  }
  return COLOR_MAP[fallback] ?? COLOR_MAP["celo-forest"];
}

export default function SparklineV5Inner({
  data,
  color = "celo-forest",
  width = 80,
  height = 24,
  variant = "default",
}: SparklineV5InnerProps) {
  const chartData = data.map((value, idx) => ({ idx, value }));
  const stroke = resolveSparklineColor(data, variant, color);

  return (
    <div
      data-testid="sparkline-root"
      data-stroke={stroke}
      style={{ width, height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
        >
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export { COLOR_MAP as SPARKLINE_COLOR_MAP, FLAT_COLOR as SPARKLINE_FLAT_COLOR };
