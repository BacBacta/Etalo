/**
 * Vitest specs for HomeMiniPay — J10-V5 Phase 4 Block 4c.
 *
 * Covers the MiniPay-native app entry surface : 2 primary CTAs +
 * brand intro + landing-hero illustration. No Get-MiniPay store CTAs
 * (HomeLanding owns that for web context), no Discover-sellers grid
 * (preempting marketplace was Mike's #2 UX trou).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HomeMiniPay } from "@/components/HomeMiniPay";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

describe("HomeMiniPay (Block 4c)", () => {
  it("renders the brand intro + landing-hero illustration + 2 primary CTAs", () => {
    render(<HomeMiniPay />);
    expect(
      screen.getByRole("heading", { name: /Welcome to Etalo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Pick a path to get started/i),
    ).toBeInTheDocument();

    // Reused landing-hero asset (Phase 3 Block 6 staged).
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute(
      "src",
      "/illustrations/v5/landing-hero.svg",
    );

    expect(
      screen.getByTestId("minipay-browse-marketplace"),
    ).toHaveTextContent(/Browse marketplace/i);
    expect(screen.getByTestId("minipay-open-boutique")).toHaveTextContent(
      /Open my boutique/i,
    );
  });

  it("Browse marketplace CTA navigates to /marketplace", () => {
    pushMock.mockClear();
    render(<HomeMiniPay />);
    fireEvent.click(screen.getByTestId("minipay-browse-marketplace"));
    expect(pushMock).toHaveBeenCalledWith("/marketplace");
  });

  it("Open my boutique CTA navigates to /seller/dashboard", () => {
    pushMock.mockClear();
    render(<HomeMiniPay />);
    fireEvent.click(screen.getByTestId("minipay-open-boutique"));
    expect(pushMock).toHaveBeenCalledWith("/seller/dashboard");
  });
});
