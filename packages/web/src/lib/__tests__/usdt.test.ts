/**
 * Vitest specs for the consolidated USDT formatter API in lib/usdt.ts.
 * J10-V5 Phase 5 polish residual Item 1 — replaces the previous
 * scattered helpers (lib/api.ts:displayUsdt(string), lib/usdt.ts:
 * displayUsdt(bigint), lib/seller-api.ts:formatRawUsdt,
 * OverviewTab.tsx:displayUsdtNumber) with 4 explicit named functions.
 *
 * Coverage : every function × edge cases (zero, decimals precision,
 * locale pin "en-US" assertion, NaN fallback, large values).
 */
import { describe, expect, it } from "vitest";

import {
  displayUsdtFromBigint,
  displayUsdtFromDecimalString,
  displayUsdtFromHumanNumber,
  formatRawUsdt,
  formatUsdt,
  parseUsdt,
  USDT_DECIMALS,
} from "@/lib/usdt";

describe("lib/usdt — Web3 primitives", () => {
  it("USDT_DECIMALS exposes the canonical 6-decimal constant", () => {
    expect(USDT_DECIMALS).toBe(6);
  });

  it("parseUsdt converts a human string into raw bigint units", () => {
    expect(parseUsdt("12.50")).toBe(12_500_000n);
    expect(parseUsdt("0")).toBe(0n);
    expect(parseUsdt("500")).toBe(500_000_000n);
  });

  it("formatUsdt converts raw bigint into a human string (no suffix)", () => {
    expect(formatUsdt(12_500_000n)).toBe("12.5");
    expect(formatUsdt(0n)).toBe("0");
    expect(formatUsdt(500_000_000n)).toBe("500");
  });
});

describe("lib/usdt — displayUsdtFromBigint", () => {
  it("formats a typical bigint amount with two decimals + USDT suffix", () => {
    expect(displayUsdtFromBigint(12_345_678n)).toBe("12.35 USDT");
  });

  it("formats zero as '0.00 USDT'", () => {
    expect(displayUsdtFromBigint(0n)).toBe("0.00 USDT");
  });

  it("formats a thousands-grouping value with en-US separator", () => {
    // 1_234_567.89 → "1,234,567.89 USDT" (not "1.234.567,89" which would
    // indicate system-locale leak via toLocaleString without explicit pin)
    expect(displayUsdtFromBigint(1_234_567_890_000n)).toBe(
      "1,234,567.89 USDT",
    );
  });

  it("formats a value with sub-cent precision rounded to 2 decimals", () => {
    // 0.123456 → "0.12 USDT"
    expect(displayUsdtFromBigint(123_456n)).toBe("0.12 USDT");
  });
});

describe("lib/usdt — displayUsdtFromDecimalString", () => {
  it("formats a typical Decimal string with two decimals + USDT suffix", () => {
    expect(displayUsdtFromDecimalString("12.35")).toBe("12.35 USDT");
  });

  it("formats zero string as '0.00 USDT'", () => {
    expect(displayUsdtFromDecimalString("0")).toBe("0.00 USDT");
  });

  it("formats a thousands-grouping value with en-US separator", () => {
    expect(displayUsdtFromDecimalString("1234567.89")).toBe(
      "1,234,567.89 USDT",
    );
  });

  it("falls back to raw string + suffix when input is not parseable", () => {
    expect(displayUsdtFromDecimalString("not-a-number")).toBe(
      "not-a-number USDT",
    );
  });
});

describe("lib/usdt — displayUsdtFromHumanNumber", () => {
  it("formats a typical number with two decimals + USDT suffix", () => {
    expect(displayUsdtFromHumanNumber(12.5)).toBe("12.50 USDT");
  });

  it("formats zero as '0.00 USDT'", () => {
    expect(displayUsdtFromHumanNumber(0)).toBe("0.00 USDT");
  });

  it("formats a thousands-grouping value with en-US separator (locale pin)", () => {
    // System-locale leak would render "1.234.567,89 USDT" on FR/DE
    // systems ; the en-US pin guarantees the comma-thousands form.
    expect(displayUsdtFromHumanNumber(1234567.89)).toBe("1,234,567.89 USDT");
  });

  it("formats a sub-cent number rounded to 2 decimals", () => {
    expect(displayUsdtFromHumanNumber(0.123)).toBe("0.12 USDT");
  });
});

describe("lib/usdt — formatRawUsdt", () => {
  it("converts raw 6-decimal number into a 2-decimal string (no suffix)", () => {
    expect(formatRawUsdt(12_990_000)).toBe("12.99");
  });

  it("formats zero as '0.00'", () => {
    expect(formatRawUsdt(0)).toBe("0.00");
  });

  it("preserves precision via toFixed(2) rounding", () => {
    expect(formatRawUsdt(12_345_678)).toBe("12.35");
  });
});
