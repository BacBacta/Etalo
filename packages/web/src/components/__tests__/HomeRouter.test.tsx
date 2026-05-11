/**
 * Vitest specs for HomeRouter — ADR-052 uniform UX.
 *
 * Post-ADR-052, HomeRouter always redirects (Chrome or MiniPay) to
 * `/marketplace`, with the only branch being the onboarding gate :
 * MiniPay visitors who haven't completed onboarding see the overlay
 * BEFORE the redirect fires.
 *
 * Older J10-V5 specs (HomeLanding vs HomeMiniPay branch dispatch)
 * are obsoleted by ADR-052 — there's no longer a separate web /
 * MiniPay view to dispatch between. Kept the OnboardingScreenV5 +
 * localStorage-flag tests because that flow survived the pivot.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeRouter } from "@/components/HomeRouter";

const routerReplaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplaceMock }),
}));

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
  routerReplaceMock.mockReset();
  window.localStorage.clear();
  clearMiniPay();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("HomeRouter — ADR-052 always-marketplace", () => {
  it("redirects Chrome visitors straight to /marketplace", async () => {
    render(<HomeRouter />);
    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/marketplace");
    });
  });

  it("redirects MiniPay visitors with the onboarded flag to /marketplace", async () => {
    setMiniPay(true);
    window.localStorage.setItem("etalo-onboarded", "true");
    render(<HomeRouter />);
    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/marketplace");
    });
  });

  it("shows the onboarding overlay on MiniPay first-visit, then redirects on CTA", async () => {
    setMiniPay(true);
    render(<HomeRouter />);
    const cta = await screen.findByRole("button", {
      name: /browse marketplace/i,
    });
    expect(cta).toBeInTheDocument();
    // CTA click marks onboarded + redirects.
    fireEvent.click(cta);
    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/marketplace");
    });
    expect(window.localStorage.getItem("etalo-onboarded")).toBe("true");
  });
});
