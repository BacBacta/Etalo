/**
 * Display formatters — Phase 5 Block 1 sub-block 1.5.
 *
 * Centralised home for formatters that need locale + timezone pinning
 * to avoid the system-locale leak / browser-timezone shift bugs that
 * surfaced in Phase 4 :
 *   - Sub-block 5.4 lesson : `toLocaleString(undefined, ...)` inherits
 *     the system locale ; on Mike's fr_FR box this produced "70,50
 *     USDT" (comma decimal) and broke the populated/zero KPI tile
 *     tests on the first run.
 *   - Sub-block 5.5 lesson : `toLocaleDateString()` similarly inherits
 *     the system locale AND the browser timezone ; a UTC-7 user
 *     opening the dashboard at 23:30 local would see yesterday's
 *     order labelled with today's date when the backend ships
 *     UTC-anchored timestamps.
 *
 * Both formatters below pin `locale: "en-US"` (CLAUDE.md English-in-UI
 * mandate) and `timeZone: "UTC"` (backend-anchored). Single shared
 * `Intl.DateTimeFormat` instance per format so we don't allocate per
 * render.
 *
 * Promote-on-2nd-consumer pattern : `formatChartDate` lived locally in
 * OverviewTab through Phase 4 Block 5.5 (single consumer = chart
 * x-axis labels). Phase 5 Block 1.5 added a 2nd consumer (row dates
 * in OrdersTab + OverviewTab Recent orders), triggering the
 * extraction here. `formatRowDate` is a sibling rather than a variant
 * because chart space is constrained and drops the year, while row
 * displays disambiguate orders across multi-year histories.
 */

const CHART_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const ROW_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Format an ISO date string as a chart x-axis label : "Apr 28".
 * No year — chart context is space-constrained and the year is
 * implicit from the surrounding window (e.g. last 7 days).
 *
 * Used by ChartLineV5 consumers (OverviewTab revenue trend).
 */
export function formatChartDate(isoDate: string): string {
  return CHART_DATE_FORMATTER.format(new Date(isoDate));
}

/**
 * Format an ISO date string as a row/list display : "Apr 28, 2026".
 * Includes the year for disambiguation across multi-year order
 * histories.
 *
 * Used by table-style row consumers (OrdersTab list, OverviewTab
 * Recent orders).
 */
export function formatRowDate(isoDate: string): string {
  return ROW_DATE_FORMATTER.format(new Date(isoDate));
}
