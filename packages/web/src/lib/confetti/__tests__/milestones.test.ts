/**
 * Vitest specs for fireMilestone (J10-V5 Phase 2 Block 7).
 *
 * Coverage:
 * - calls confetti() with the V5-palette preset shape for one milestone
 *   (full preset matrix would be tautological — one shape spec proves
 *   the dispatch mechanism + the colors stay aligned tailwind tokens)
 * - prefers-reduced-motion noop : matchMedia returning matches=true
 *   suppresses the call entirely (a11y contract)
 *
 * Mocking strategy: vi.mock("canvas-confetti") replaces the default
 * export with a spy. matchMedia is stubbed via vi.stubGlobal because
 * jsdom doesn't ship one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

import confetti from "canvas-confetti";
import { fireMilestone } from "@/lib/confetti/milestones";

const confettiSpy = confetti as unknown as ReturnType<typeof vi.fn>;

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  // window.matchMedia is what fireMilestone calls; mirror the stub.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: window.matchMedia,
  });
}

describe("fireMilestone", () => {
  beforeEach(() => {
    confettiSpy.mockClear();
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls confetti with the V5 palette preset shape for first-sale", () => {
    fireMilestone("first-sale");
    expect(confettiSpy).toHaveBeenCalledTimes(1);
    const args = confettiSpy.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
    });
    // Colors mirror tailwind.config.ts V5 tokens exactly:
    // celo-forest #476520 + celo-yellow #FBCC5C
    expect(args.colors).toEqual(["#476520", "#FBCC5C"]);
  });

  it("noops when prefers-reduced-motion: reduce matches (a11y contract)", () => {
    stubMatchMedia(true);
    fireMilestone("withdrawal-complete");
    fireMilestone("onboarding-complete");
    fireMilestone("first-sale");
    expect(confettiSpy).not.toHaveBeenCalled();
  });
});
