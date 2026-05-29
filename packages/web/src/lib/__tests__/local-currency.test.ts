import { describe, expect, it } from "vitest";

import { formatLocalCurrencyHint } from "@/lib/local-currency";

describe("formatLocalCurrencyHint", () => {
  it("formats NGN with whole-unit grouping and the ~ prefix", () => {
    const hint = formatLocalCurrencyHint("25.00", "NGA");
    expect(hint).toBe("~₦38 500");
  });

  it("formats GHS with 1 decimal", () => {
    const hint = formatLocalCurrencyHint("10.00", "GHA");
    expect(hint).toBe("~GH₵128.0");
  });

  it("formats ZAR with the rand symbol", () => {
    const hint = formatLocalCurrencyHint("5.00", "ZAF");
    expect(hint).toBe("~R91.0");
  });

  it("returns null on unknown country (forces caller to hide chip)", () => {
    expect(formatLocalCurrencyHint("10", "ZWE")).toBeNull();
  });

  it("returns null when country is null/undefined", () => {
    expect(formatLocalCurrencyHint("10", null)).toBeNull();
    expect(formatLocalCurrencyHint("10", undefined)).toBeNull();
  });

  it("returns null on unparseable amount", () => {
    expect(formatLocalCurrencyHint("not-a-number", "NGA")).toBeNull();
  });

  it("returns null on negative amount", () => {
    expect(formatLocalCurrencyHint(-5, "NGA")).toBeNull();
  });
});
