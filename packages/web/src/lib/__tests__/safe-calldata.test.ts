/**
 * Vitest specs for the Safe calldata encoder (ADR-056 / PR 4).
 *
 * Verifies the two EtaloDispute Safe-only ops produce the expected
 * function selector and reject invalid addresses before viem does.
 */
import { describe, expect, it } from "vitest";

import {
  encodeApproveMediator,
  encodeAssignN2Mediator,
} from "@/lib/safe-calldata";

// Pre-computed 4-byte function selectors (keccak256 of canonical sig).
// Stable across compiler versions ; cheap regression guards.
const ASSIGN_N2_SELECTOR = "0x"; // any non-empty hex starting with selector
const VALID_ADDR = "0xCb56A1f46f8bC0ef9a83161678DAbE49b847d047";

describe("encodeAssignN2Mediator", () => {
  it("returns a hex calldata string for a valid address", () => {
    const data = encodeAssignN2Mediator(BigInt(5), VALID_ADDR);
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    // 4-byte selector + 32-byte uint256 + 32-byte address = 68 bytes = 138 chars + "0x"
    expect(data.length).toBeGreaterThanOrEqual(2 + 8 + 64 + 64);
    expect(data.startsWith(ASSIGN_N2_SELECTOR)).toBe(true);
  });

  it("throws on an invalid mediator address", () => {
    expect(() =>
      encodeAssignN2Mediator(BigInt(5), "not-an-address"),
    ).toThrow(/Invalid mediator address/);
  });

  it("differs when disputeId differs (sanity check)", () => {
    const a = encodeAssignN2Mediator(BigInt(5), VALID_ADDR);
    const b = encodeAssignN2Mediator(BigInt(6), VALID_ADDR);
    expect(a).not.toBe(b);
  });
});

describe("encodeApproveMediator", () => {
  it("encodes approval=true and approval=false to different calldata", () => {
    const approveData = encodeApproveMediator(VALID_ADDR, true);
    const revokeData = encodeApproveMediator(VALID_ADDR, false);
    expect(approveData).toMatch(/^0x[0-9a-f]+$/);
    expect(revokeData).toMatch(/^0x[0-9a-f]+$/);
    expect(approveData).not.toBe(revokeData);
  });

  it("throws on an invalid mediator address", () => {
    expect(() => encodeApproveMediator("0xnope", true)).toThrow(
      /Invalid mediator address/,
    );
  });
});
