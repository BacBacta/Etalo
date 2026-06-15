import { describe, expect, it } from "vitest";

import { isTreasuryAdmin } from "@/lib/treasury-api";

const SAFE = "0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F";
const OWNER = "0xfcfE723245e1e926Ae676025138cA2C38ecBA8D8";

describe("isTreasuryAdmin", () => {
  it("allows the Safe address (case-insensitive)", () => {
    expect(isTreasuryAdmin(SAFE)).toBe(true);
    expect(isTreasuryAdmin(SAFE.toLowerCase())).toBe(true);
  });

  it("allows a Safe owner", () => {
    expect(isTreasuryAdmin(OWNER)).toBe(true);
  });

  it("rejects a non-allowlisted wallet", () => {
    expect(isTreasuryAdmin("0x000000000000000000000000000000000000dead")).toBe(
      false,
    );
  });

  it("rejects null / undefined", () => {
    expect(isTreasuryAdmin(undefined)).toBe(false);
    expect(isTreasuryAdmin(null)).toBe(false);
  });
});
