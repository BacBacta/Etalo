/**
 * Treasury revenue client (ADR-059 follow-up).
 *
 * Owner-only surface: the UI is shown only when the connected wallet is
 * in the treasury allowlist (the Safe + its 3 owners — a Safe is a
 * contract, so in MiniPay an owner connects as an EOA; both forms are
 * allowed). The backend enforces the same allowlist server-side.
 */
import { fetchApi } from "@/lib/fetch-api";
import { walletAuthHeaders } from "@/lib/wallet-auth";

// Default = mainnet Safe + its 3 owner EOAs (public, in CLAUDE.md).
// Overridable via NEXT_PUBLIC_TREASURY_ADMIN_ADDRESSES (comma-separated).
const DEFAULT_ADMINS = [
  "0x10d6ff4eb8372ae20638db1f87a60f31fdf13e0f",
  "0xcb56a1f46f8bc0ef9a83161678dabe49b847d047",
  "0xfcfe723245e1e926ae676025138ca2c38ecba8d8",
  "0x1b26f42cc3b1e21afe33756b9282a5514f030a12",
].join(",");

export const TREASURY_ADMIN_ADDRESSES: ReadonlySet<string> = new Set(
  (process.env.NEXT_PUBLIC_TREASURY_ADMIN_ADDRESSES ?? DEFAULT_ADMINS)
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean),
);

export function isTreasuryAdmin(address?: string | null): boolean {
  return !!address && TREASURY_ADMIN_ADDRESSES.has(address.toLowerCase());
}

export interface RevenueSummary {
  from: string | null;
  to: string | null;
  sources: Record<string, { count: number; total_usdt: string }>;
}

function rangeQuery(from?: string, to?: string): string {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function fetchRevenueSummary(
  wallet: string,
  from?: string,
  to?: string,
): Promise<RevenueSummary> {
  const res = await fetchApi(`/treasury/revenue/summary${rangeQuery(from, to)}`, {
    headers: walletAuthHeaders(wallet),
  });
  if (res.status === 403) throw new Error("Not authorised for treasury reports.");
  if (!res.ok) throw new Error(`Revenue summary failed: ${res.status}`);
  return (await res.json()) as RevenueSummary;
}

/** Fetches the CSV and triggers a browser download. */
export async function downloadRevenueCsv(
  wallet: string,
  from?: string,
  to?: string,
): Promise<void> {
  const res = await fetchApi(`/treasury/revenue.csv${rangeQuery(from, to)}`, {
    headers: walletAuthHeaders(wallet),
  });
  if (!res.ok) throw new Error(`Revenue export failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `etalo-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
