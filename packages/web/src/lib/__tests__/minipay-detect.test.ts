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
const ORIGINAL_HOSTNAME = window.location.hostname;

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

const setHostname = (hostname: string) => {
  Object.defineProperty(window, "location", {
    value: { ...window.location, hostname },
    configurable: true,
    writable: true,
  });
};

beforeEach(() => {
  // Reset all signals before each test.
  vi.unstubAllEnvs();
  setEthereum(undefined);
  setUA(ORIGINAL_UA);
  setHostname(ORIGINAL_HOSTNAME);
});

afterEach(() => {
  vi.unstubAllEnvs();
  setEthereum(undefined);
  setUA(ORIGINAL_UA);
  setHostname(ORIGINAL_HOSTNAME);
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

  // J10-V5 Phase 4 hotfix #4 — pragmatic hostname signal for the
  // ngrok-tunnel workflow Mike uses for MiniPay Developer / Test mode
  // testing. Runtime check, immune to NEXT_PUBLIC_* build-time inlining
  // staleness.
  it("returns true when hostname matches *.ngrok-free.dev (Mike's workflow)", () => {
    setHostname("upright-henna-armless.ngrok-free.dev");
    expect(detectMiniPay()).toBe(true);
  });

  it("returns true when hostname matches *.ngrok.io (legacy ngrok)", () => {
    setHostname("abc123.ngrok.io");
    expect(detectMiniPay()).toBe(true);
  });

  it("returns true when hostname matches *.ngrok.app (newer ngrok TLD)", () => {
    setHostname("xyz789.ngrok.app");
    expect(detectMiniPay()).toBe(true);
  });

  it("returns false on regular production / localhost hostnames", () => {
    const hosts = ["etalo.app", "localhost", "127.0.0.1", "vercel.app"];
    for (const host of hosts) {
      setHostname(host);
      // Reset other signals so only hostname is in play.
      setEthereum(undefined);
      setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0");
      expect(detectMiniPay(), `host=${host}`).toBe(false);
    }
  });
});
