/**
 * ChartLineV5Inner — pure recharts implementation. Imported on the
 * client only via the `next/dynamic` wrapper in ChartLineV5.tsx (J10-V5
 * Phase 3 Block 4). Recharts ships ~70 KB tree-shaken; lazy-loading
 * keeps it out of the per-route First Load on prod surfaces that don't
 * actually render a chart.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartLineV5Datum {
  label: string;
  value: number;
}

// Tailwind class names cannot reach SVG fill/stroke props at runtime —
// the chart palette must resolve to literal hex from tailwind.config.ts.
// Keep this map in sync with `theme.extend.colors.celo.*`.
const COLOR_MAP: Record<string, string> = {
  "celo-forest": "#476520",
  "celo-yellow": "#FBCC5C",
  "celo-red": "#A8362F",
  "celo-blue": "#1E88E5",
};

const GRID_COLOR = "rgba(46,51,56,0.08)"; // celo-dark/8%
const AXIS_LABEL_COLOR = "rgba(46,51,56,0.6)"; // celo-dark/60

export interface ChartLineV5InnerProps {
  data: ChartLineV5Datum[];
  color?: keyof typeof COLOR_MAP;
  height?: number;
  showGrid?: boolean;
  showAxis?: boolean;
}

interface TooltipPayload {
  value: number;
  payload: ChartLineV5Datum;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0].value;
  return (
    <div
      data-testid="chart-tooltip"
      className="rounded-lg bg-celo-light p-3 shadow-celo-md"
    >
      <p className="font-display text-celo-dark text-body-sm">{label}</p>
      <p
        className="font-sans text-body text-celo-forest"
        // Inline style intentionally retained to mirror the chart
        // container's pattern below (line ~107). Both sites use the
        // same mechanism for in-file consistency ; the container's
        // inline style is load-bearing for SVG inheritance, this
        // tooltip <p> could use the Tailwind class but keeping the
        // two on the same mechanism reduces drift risk if one is
        // ever refactored. Phase 5 Block 1 sub-block 1.1 deliberate
        // retention.
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
    </div>
  );
}

export default function ChartLineV5Inner({
  data,
  color = "celo-forest",
  height = 200,
  showGrid = true,
  showAxis = true,
}: ChartLineV5InnerProps) {
  if (data.length === 0) {
    return (
      <div
        data-testid="chart-line-empty"
        style={{ height }}
        className="flex items-center justify-center rounded-md bg-neutral-50 text-celo-dark/60"
      >
        <p className="text-body-sm">No data yet</p>
      </div>
    );
  }

  const stroke = COLOR_MAP[color] ?? COLOR_MAP["celo-forest"];

  return (
    <div
      data-testid="chart-line-root"
      data-color={color}
      data-stroke={stroke}
      style={{
        width: "100%",
        height,
        // CSS font-variant-numeric is inherited; this propagates to the
        // SVG <text> nodes recharts emits for axis ticks. Recharts 3.x
        // typings reject `fontVariantNumeric` inside `tick` props
        // directly, so we lift the rule onto the parent.
        //
        // Phase 5 Block 1 sub-block 1.1 deliberate retention: do NOT
        // refactor to Tailwind className. Tailwind's `tabular-nums`
        // class compiles to the same CSS rule, BUT className on this
        // outer <div> doesn't cascade into Recharts' nested SVG
        // <text> children — only inline `style` does, via the
        // computed-style inheritance path. Switching loses the
        // tabular alignment on every chart axis tick.
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          {showGrid && (
            <CartesianGrid
              stroke={GRID_COLOR}
              strokeDasharray="3 3"
              vertical={false}
            />
          )}
          {showAxis && (
            <>
              <XAxis
                dataKey="label"
                stroke={AXIS_LABEL_COLOR}
                tick={{ fontSize: 13, fill: AXIS_LABEL_COLOR }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke={AXIS_LABEL_COLOR}
                tick={{ fontSize: 13, fill: AXIS_LABEL_COLOR }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
            </>
          )}
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: GRID_COLOR, strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: stroke }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export { COLOR_MAP as CHART_LINE_COLOR_MAP };
