/**
 * Vitest specs for HomeRouter — J10-V5 Phase 4 Blocks 4b + 4c.
 *
 * Covers :
 *   - Block 4b : first-visit OnboardingScreenV5 overlay gated on
 *     MiniPay context + `etalo-onboarded` localStorage flag.
 *   - Block 4c : view dispatch landing|minipay (HomeMiniPay split
 *     for MiniPay-native context, HomeLanding for web SEO context).
 *
 * The legacy `etalo-mode-preference` auto-redirect was dropped Block
 * 4b — perceived "5s auto-redirect" bug per Mike's MiniPay testing
 * (sticky preference + Wagmi provider injection latency).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeRouter } from "@/components/HomeRouter";

// next/navigation isn't available in jsdom — stub useRouter so
// HomeLanding + HomeMiniPay + Link work without a real Next.js
// navigation context.
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

const LANDING_HEADING = /Etalo — Your digital stall, open 24\/7/i;
const MINIPAY_HEADING = /Welcome to Etalo/i;

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
  });

  it("subsequent MiniPay visit (flag = 'true') renders HomeMiniPay without overlay", async () => {
    setMiniPay(true);
    window.localStorage.setItem("etalo-onboarded", "true");
    render(<HomeRouter featuredSellers={[]} />);
    await waitFor(() => {
      // HomeMiniPay h1 visible (post-Block 4c view dispatch).
      expect(
        screen.getByRole("heading", { level: 1, name: MINIPAY_HEADING }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("non-MiniPay (web) visitors never see the overlay even on first visit", async () => {
    setMiniPay(false);
    render(<HomeRouter featuredSellers={[]} />);
    await waitFor(() => {
      // HomeLanding marketing heading visible (web SEO surface).
      expect(
        screen.getByRole("heading", { level: 1, name: LANDING_HEADING }),
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
    // HomeMiniPay still visible underneath the dismissed overlay.
    expect(
      screen.getByRole("heading", { level: 1, name: MINIPAY_HEADING }),
    ).toBeInTheDocument();
  });
});

describe("HomeRouter — view dispatch landing|minipay (Block 4c)", () => {
  it("MiniPay context renders HomeMiniPay (with 2 mode CTAs), not HomeLanding", async () => {
    setMiniPay(true);
    window.localStorage.setItem("etalo-onboarded", "true");
    render(<HomeRouter featuredSellers={[]} />);
    await waitFor(() => {
      expect(screen.getByTestId("minipay-browse-marketplace")).toBeInTheDocument();
    });
    expect(screen.getByTestId("minipay-open-boutique")).toBeInTheDocument();
    // The legacy HomeLanding marketing heading must NOT appear in
    // MiniPay context — Get-MiniPay store CTAs + Discover-sellers grid
    // were Mike's #1 + #2 UX trous post Block 4b.
    expect(
      screen.queryByRole("heading", { level: 1, name: LANDING_HEADING }),
    ).not.toBeInTheDocument();
  });

  it("non-MiniPay context renders HomeLanding (not HomeMiniPay)", async () => {
    setMiniPay(false);
    render(<HomeRouter featuredSellers={[]} />);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: LANDING_HEADING }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("minipay-browse-marketplace"),
    ).not.toBeInTheDocument();
  });
});

describe("HomeRouter — dynamic import HomeMiniPay (Phase 4 hotfix #6)", () => {
  // Hotfix #6 replaced the lazy-init + suppressHydrationWarning
  // (hotfix #5) with next/dynamic + ssr: false. The previous approach
  // eliminated the visible flash but left React hydration error #5
  // ("Expected server HTML to contain a matching <img> in <div>")
  // because HomeMiniPay's hero <img> had no SSR analogue. Dynamic
  // import bypasses hydration entirely for the MiniPay subtree.
  it("renders HomeMiniPay after dynamic chunk load when MiniPay detected", async () => {
    setMiniPay(true);
    window.localStorage.setItem("etalo-onboarded", "true");
    render(<HomeRouter featuredSellers={[]} />);
    // waitFor handles the dynamic import resolution + Suspense
    // fallback transition. The assertion succeeds once the lazy
    // chunk finishes resolving and HomeMiniPay's CTA mounts.
    await waitFor(() => {
      expect(
        screen.getByTestId("minipay-browse-marketplace"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("heading", { level: 1, name: LANDING_HEADING }),
    ).not.toBeInTheDocument();
  });
});
