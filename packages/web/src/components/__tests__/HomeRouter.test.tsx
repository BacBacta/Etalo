/**
 * Vitest specs for HomeRouter — J10-V5 Phase 4 Block 4b.
 *
 * Covers the new first-visit OnboardingScreenV5 flow gated on
 * MiniPay context + `etalo-onboarded` localStorage flag :
 *   1. First MiniPay visit (no flag) → overlay mounts after useEffect
 *   2. Subsequent visit (flag set) → no overlay
 *   3. CTA Get Started sets the flag + dismisses the overlay
 *
 * The legacy `etalo-mode-preference` auto-redirect was dropped this
 * block — perceived "5s auto-redirect" bug per Mike's MiniPay testing
 * (sticky preference + Wagmi provider injection latency).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeRouter } from "@/components/HomeRouter";

// next/navigation isn't available in jsdom — stub useRouter so HomeLanding
// + Link work without a real Next.js navigation context.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// next/image stub (test environment doesn't run the image optimizer).
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />,
}));

const setMiniPay = (isMiniPay: boolean) => {
  Object.defineProperty(window, "ethereum", {
    value: { isMiniPay },
    configurable: true,
    writable: true,
  });
};

const clearMiniPay = () => {
  Object.defineProperty(window, "ethereum", {
    value: undefined,
    configurable: true,
    writable: true,
  });
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  clearMiniPay();
});

describe("HomeRouter — onboarding overlay (Block 4b)", () => {
  it("first MiniPay visit (no etalo-onboarded flag) mounts OnboardingScreenV5", async () => {
    setMiniPay(true);
    render(<HomeRouter featuredSellers={[]} />);
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /Welcome to Etalo/i }),
      ).toBeInTheDocument();
    });
    // Landing renders underneath (consistent SSR + non-MiniPay behavior).
    expect(
      screen.getByRole("heading", {
        name: /Etalo — Your digital stall, open 24\/7/i,
      }),
    ).toBeInTheDocument();
  });

  it("subsequent MiniPay visit (flag = 'true') renders landing without overlay", async () => {
    setMiniPay(true);
    window.localStorage.setItem("etalo-onboarded", "true");
    render(<HomeRouter featuredSellers={[]} />);
    // Give useEffect a tick to run (it's a no-op in this scenario but
    // we still want to assert the overlay never appears).
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: /Etalo — Your digital stall, open 24\/7/i,
        }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("non-MiniPay (web) visitors never see the overlay even on first visit", async () => {
    setMiniPay(false);
    render(<HomeRouter featuredSellers={[]} />);
    // Allow useEffect to run.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: /Etalo — Your digital stall, open 24\/7/i,
        }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("CTA Get Started sets the etalo-onboarded flag and dismisses the overlay", async () => {
    setMiniPay(true);
    render(<HomeRouter featuredSellers={[]} />);

    const cta = await screen.findByTestId("onboarding-cta");
    expect(window.localStorage.getItem("etalo-onboarded")).toBeNull();

    fireEvent.click(cta);

    expect(window.localStorage.getItem("etalo-onboarded")).toBe("true");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // Landing remains visible after dismissal.
    expect(
      screen.getByRole("heading", {
        name: /Etalo — Your digital stall, open 24\/7/i,
      }),
    ).toBeInTheDocument();
  });
});
