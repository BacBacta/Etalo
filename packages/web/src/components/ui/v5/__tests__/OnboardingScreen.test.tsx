/**
 * Vitest specs for OnboardingScreenV5 (J10-V5 Phase 4 Block 4a).
 *
 * Coverage: title + description + illustration rendering, CTA click
 * fires callback, optional skip button conditional + handler, a11y
 * (role=dialog + aria-modal + aria-labelledby), entrance animation
 * Tailwind classes present, asset enum mapping.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ONBOARDING_ASSET_PATH,
  OnboardingScreenV5,
} from "@/components/ui/v5/OnboardingScreen";

describe("OnboardingScreenV5", () => {
  it("renders title + description + illustration as decorative", () => {
    render(
      <OnboardingScreenV5
        title="Welcome to Etalo"
        description="Your digital stall, open 24/7."
        ctaLabel="Get Started"
        onCtaClick={vi.fn()}
      />,
    );
    const heading = screen.getByRole("heading", { name: /Welcome to Etalo/i });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H1");

    expect(
      screen.getByText(/Your digital stall, open 24\/7/i),
    ).toBeInTheDocument();

    const img = screen.getByTestId("onboarding-illustration");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img).toHaveAttribute("src", ONBOARDING_ASSET_PATH.welcome);
    expect(img).toHaveAttribute("data-asset", "welcome");
  });

  it("CTA onClick fires the callback", () => {
    const onCtaClick = vi.fn();
    render(
      <OnboardingScreenV5
        title="Welcome"
        ctaLabel="Get Started"
        onCtaClick={onCtaClick}
      />,
    );
    fireEvent.click(screen.getByTestId("onboarding-cta"));
    expect(onCtaClick).toHaveBeenCalledTimes(1);
  });

  it("optional skip button renders only when both skipLabel and onSkip are passed", () => {
    const onSkip = vi.fn();
    const { rerender } = render(
      <OnboardingScreenV5
        title="Welcome"
        ctaLabel="Get Started"
        onCtaClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("onboarding-skip")).not.toBeInTheDocument();

    rerender(
      <OnboardingScreenV5
        title="Welcome"
        ctaLabel="Get Started"
        onCtaClick={vi.fn()}
        skipLabel="Skip"
        onSkip={onSkip}
      />,
    );
    const skip = screen.getByTestId("onboarding-skip");
    expect(skip).toBeInTheDocument();
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("exposes role=dialog, aria-modal=true, aria-labelledby pointing at the heading", () => {
    render(
      <OnboardingScreenV5
        title="Welcome"
        ctaLabel="Get Started"
        onCtaClick={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: /Welcome/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy!);
    expect(heading).toHaveTextContent(/Welcome/i);
  });

  it("applies the Tailwind animate-in entrance classes (CSS-only, no motion)", () => {
    render(
      <OnboardingScreenV5
        title="Welcome"
        ctaLabel="Get Started"
        onCtaClick={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    // Entrance classes from tailwindcss-animate plugin (already used
    // by the legacy shadcn dialog). Pure CSS, zero motion bundle cost.
    expect(dialog).toHaveClass("animate-in");
    expect(dialog).toHaveClass("fade-in-0");
    expect(dialog).toHaveClass("slide-in-from-bottom-4");
  });
});
