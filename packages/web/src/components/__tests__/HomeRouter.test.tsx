/**
 * Vitest specs for HomeRouter — ADR-053 chooser-first landing.
 *
 * Walks back ADR-052's auto-redirect-to-marketplace : `/` now renders
 * the HomeMiniPay chooser ("Browse marketplace" / "Open my boutique")
 * for every visitor (Chrome and MiniPay). Onboarding overlay still
 * shows once on first MiniPay open before the chooser.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeRouter } from "@/components/HomeRouter";

const routerPushMock = vi.fn();
const routerReplaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }),
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
  routerPushMock.mockReset();
  routerReplaceMock.mockReset();
  window.localStorage.clear();
  clearMiniPay();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("HomeRouter — ADR-053 chooser-first", () => {
  it("renders the chooser CTAs for Chrome visitors (no auto-redirect)", async () => {
    render(<HomeRouter />);
    expect(
      await screen.findByTestId("minipay-browse-marketplace"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("minipay-open-boutique")).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("renders the chooser for MiniPay visitors with the onboarded flag", async () => {
    setMiniPay(true);
    window.localStorage.setItem("etalo-onboarded", "true");
    render(<HomeRouter />);
    expect(
      await screen.findByTestId("minipay-browse-marketplace"),
    ).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("shows the onboarding overlay on MiniPay first-visit, then the chooser on CTA", async () => {
    setMiniPay(true);
    render(<HomeRouter />);
    const cta = await screen.findByRole("button", {
      name: /get started/i,
    });
    fireEvent.click(cta);
    await waitFor(() => {
      expect(
        screen.getByTestId("minipay-browse-marketplace"),
      ).toBeInTheDocument();
    });
    expect(window.localStorage.getItem("etalo-onboarded")).toBe("true");
  });

  it("Browse marketplace CTA navigates to /marketplace", async () => {
    render(<HomeRouter />);
    const cta = await screen.findByTestId("minipay-browse-marketplace");
    fireEvent.click(cta);
    expect(routerPushMock).toHaveBeenCalledWith("/marketplace");
  });
});
