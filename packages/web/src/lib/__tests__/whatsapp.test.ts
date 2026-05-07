/**
 * Vitest specs for lib/whatsapp.ts — Sprint J11.7 Block 8 (ADR-044).
 */
import { describe, expect, it } from "vitest";

import {
  buildWhatsAppCoordinateUrl,
  formatPhoneForWhatsApp,
} from "@/lib/whatsapp";

describe("formatPhoneForWhatsApp", () => {
  it("strips the leading + and keeps already-international numbers", () => {
    expect(formatPhoneForWhatsApp("+2349011234567", "NGA")).toBe(
      "2349011234567",
    );
  });

  it("adds the country code to a local number with leading 0", () => {
    expect(formatPhoneForWhatsApp("09011234567", "NGA")).toBe(
      "2349011234567",
    );
  });

  it("strips spaces and dashes", () => {
    expect(formatPhoneForWhatsApp("+233 24 123 45-67", "GHA")).toBe(
      "233241234567",
    );
  });

  it("returns null for empty / null input", () => {
    expect(formatPhoneForWhatsApp(null, "NGA")).toBeNull();
    expect(formatPhoneForWhatsApp("", "NGA")).toBeNull();
    expect(formatPhoneForWhatsApp("   ", "NGA")).toBeNull();
  });

  it("returns null for unknown country code", () => {
    expect(formatPhoneForWhatsApp("123456789", "FRA")).toBeNull();
  });

  it("accepts international numbers when country is null", () => {
    expect(formatPhoneForWhatsApp("+2349011234567", null)).toBe(
      "2349011234567",
    );
    expect(formatPhoneForWhatsApp("+254712345678", undefined)).toBe(
      "254712345678",
    );
  });

  it("rejects local numbers when country is null", () => {
    expect(formatPhoneForWhatsApp("09011234567", null)).toBeNull();
  });
});

describe("buildWhatsAppCoordinateUrl", () => {
  it("builds a wa.me URL with URL-encoded message", () => {
    const url = buildWhatsAppCoordinateUrl({
      phone: "+2349011234567",
      country: "NGA",
      orderId: 42,
    });
    expect(url).toMatch(/^https:\/\/wa\.me\/2349011234567\?text=/);
    // Spaces become %20 (encodeURIComponent), order id present.
    expect(url).toContain("Etalo%20order%20%2342");
  });

  it("returns null when the phone can't be formatted", () => {
    const url = buildWhatsAppCoordinateUrl({
      phone: null,
      country: "NGA",
      orderId: 1,
    });
    expect(url).toBeNull();
  });

  it("accepts a string orderId", () => {
    const url = buildWhatsAppCoordinateUrl({
      phone: "+233241234567",
      country: "GHA",
      orderId: "abc-uuid",
    });
    expect(url).toContain("order%20%23abc-uuid");
  });
});
