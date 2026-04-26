import { describe, expect, it } from "vitest";
import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { buildAuthMessage } from "@/lib/eip191";

describe("buildAuthMessage", () => {
  it("matches the backend canonical form (uppercase method)", () => {
    expect(buildAuthMessage("post", "/api/v1/orders/abc/metadata", 1714050000)).toBe(
      "Etalo auth: POST /api/v1/orders/abc/metadata 1714050000",
    );
  });

  it("preserves path verbatim (no normalization)", () => {
    expect(buildAuthMessage("POST", "/api/v1/x", 42)).toBe(
      "Etalo auth: POST /api/v1/x 42",
    );
  });
});

describe("EIP-191 round-trip", () => {
  it("signature recovers to the signer address", async () => {
    const pk =
      "0x1010101010101010101010101010101010101010101010101010101010101010" as const;
    const account = privateKeyToAccount(pk);
    const message = buildAuthMessage(
      "POST",
      "/api/v1/orders/abc/metadata",
      1714050000,
    );

    const signature = await account.signMessage({ message });
    const recovered = await recoverMessageAddress({ message, signature });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });
});
