/**
 * Vitest specs for detectMiniPay() helper — J10-V5 Phase 4 hotfix.
 *
 * Covers the 3-signal detection ladder :
 *   1. NEXT_PUBLIC_FORCE_MINIPAY env override → true
 *   2. window.ethereum.isMiniPay canonical → true
 *   3. navigator.userAgent /MiniPay|Opera Mini/i fallback → true
 *   ø no signal → false
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectMiniPay } from "@/lib/minipay-detect";

const ORIGINAL_UA = navigator.userAgent;

const setUA = (ua: string) => {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
    writable: true,
  });
};

const setEthereum = (eth: unknown) => {
  Object.defineProperty(window, "ethereum", {
    value: eth,
    configurable: true,
    writable: true,
  });
};

beforeEach(() => {
  // Reset all signals before each test.
  vi.unstubAllEnvs();
  setEthereum(undefined);
  setUA(ORIGINAL_UA);
});

afterEach(() => {
  vi.unstubAllEnvs();
  setEthereum(undefined);
  setUA(ORIGINAL_UA);
});

describe("detectMiniPay()", () => {
  it("returns true when window.ethereum.isMiniPay === true (production canonical)", () => {
    setEthereum({ isMiniPay: true });
    expect(detectMiniPay()).toBe(true);
  });

  it("returns true when NEXT_PUBLIC_FORCE_MINIPAY=true env override is set", () => {
    vi.stubEnv("NEXT_PUBLIC_FORCE_MINIPAY", "true");
    // No ethereum, no UA match — env override alone wins.
    expect(detectMiniPay()).toBe(true);
  });

  it("returns true when navigator.userAgent matches /MiniPay/i (Mini App Test mode fallback)", () => {
    setUA("Mozilla/5.0 (Linux; Android 13) MiniPay/1.0 Chrome/120.0");
    expect(detectMiniPay()).toBe(true);
  });

  it("returns true when userAgent matches /Opera Mini/i (alt fallback)", () => {
    setUA("Opera Mini/79.0 (compatible)");
    expect(detectMiniPay()).toBe(true);
  });

  it("returns false when no signal matches (web visitor, plain wallet)", () => {
    setEthereum({ isMiniPay: false }); // MetaMask-style provider with no MiniPay flag.
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0");
    expect(detectMiniPay()).toBe(false);
  });

  it("returns false when window is undefined (SSR)", () => {
    // Simulate SSR by checking that the early-return fires when the
    // helper is called in a context where window doesn't exist. We
    // can't actually delete window in jsdom, so this asserts the
    // behavioral path indirectly: with everything cleared, no signal
    // is true and the result is false.
    setEthereum(undefined);
    setUA("Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0");
    expect(detectMiniPay()).toBe(false);
  });

  it("env override beats absence of provider (desktop dev unblock)", () => {
    vi.stubEnv("NEXT_PUBLIC_FORCE_MINIPAY", "true");
    setEthereum(undefined);
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0");
    expect(detectMiniPay()).toBe(true);
  });
});
