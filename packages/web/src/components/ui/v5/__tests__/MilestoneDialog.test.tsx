/**
 * Vitest specs for MilestoneDialogV5 (J10-V5 Phase 4 Block 6
 * sub-block 6.1).
 *
 * The component is a thin specialization of DialogV4 (covered by its
 * own specs in components/ui/v4/__tests__/Dialog.test.tsx). These
 * specs focus on the V5 specialization concerns :
 *  - Open/closed render gating.
 *  - Variant -> illustration src mapping (the load-bearing part of
 *    the API consumers will rely on in sub-block 6.3).
 *  - CTA flow : click fires onCtaClick AND closes via onOpenChange.
 *  - Title / description / CTA label propagation.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  MILESTONE_ILLUSTRATIONS,
  MilestoneDialogV5,
} from "@/components/ui/v5/MilestoneDialog";

const baseProps = {
  variant: "first-sale" as const,
  title: "First sale!",
  description: "You just made your first sale on Etalo.",
  ctaLabel: "Continue",
};

describe("MilestoneDialogV5", () => {
  it("renders the dialog with title + description + CTA when open=true", () => {
    render(
      <MilestoneDialogV5
        {...baseProps}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("milestone-dialog")).toBeInTheDocument();
    expect(screen.getByText(baseProps.title)).toBeInTheDocument();
    expect(screen.getByText(baseProps.description)).toBeInTheDocument();
    expect(screen.getByTestId("milestone-dialog-cta")).toHaveTextContent(
      baseProps.ctaLabel,
    );
  });

  it("does NOT render the dialog when open=false", () => {
    render(
      <MilestoneDialogV5
        {...baseProps}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("milestone-dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(baseProps.title)).not.toBeInTheDocument();
  });

  it("variant='first-sale' renders the success-first-sale.svg illustration", () => {
    render(
      <MilestoneDialogV5
        {...baseProps}
        variant="first-sale"
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    const dialog = screen.getByTestId("milestone-dialog");
    expect(dialog).toHaveAttribute("data-variant", "first-sale");
    const img = screen.getByTestId("milestone-dialog-illustration");
    expect(img).toHaveAttribute(
      "src",
      "/illustrations/v5/success-first-sale.svg",
    );
    // Alt text is non-empty + descriptive (a11y requirement).
    expect(img.getAttribute("alt") ?? "").toMatch(/first.*sale/i);
  });

  it("variant='withdrawal-complete' renders the success-withdrawal-complete.svg illustration", () => {
    render(
      <MilestoneDialogV5
        {...baseProps}
        variant="withdrawal-complete"
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    const dialog = screen.getByTestId("milestone-dialog");
    expect(dialog).toHaveAttribute("data-variant", "withdrawal-complete");
    const img = screen.getByTestId("milestone-dialog-illustration");
    expect(img).toHaveAttribute(
      "src",
      "/illustrations/v5/success-withdrawal-complete.svg",
    );
    expect(img.getAttribute("alt") ?? "").toMatch(/withdrawal/i);
  });

  it("CTA click fires onCtaClick exactly once AND closes the dialog via onOpenChange(false)", () => {
    const onCtaClick = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MilestoneDialogV5
        {...baseProps}
        open={true}
        onOpenChange={onOpenChange}
        onCtaClick={onCtaClick}
      />,
    );
    fireEvent.click(screen.getByTestId("milestone-dialog-cta"));
    expect(onCtaClick).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("omitting onCtaClick still closes the dialog cleanly on CTA click", () => {
    const onOpenChange = vi.fn();
    render(
      <MilestoneDialogV5
        {...baseProps}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByTestId("milestone-dialog-cta"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("MILESTONE_ILLUSTRATIONS map exposes both V1 + V2 forward-compat variants with valid SVG paths", () => {
    expect(MILESTONE_ILLUSTRATIONS["first-sale"].src).toBe(
      "/illustrations/v5/success-first-sale.svg",
    );
    expect(MILESTONE_ILLUSTRATIONS["withdrawal-complete"].src).toBe(
      "/illustrations/v5/success-withdrawal-complete.svg",
    );
    // Alt text non-empty for both — a11y baseline.
    expect(
      MILESTONE_ILLUSTRATIONS["first-sale"].alt.length,
    ).toBeGreaterThan(0);
    expect(
      MILESTONE_ILLUSTRATIONS["withdrawal-complete"].alt.length,
    ).toBeGreaterThan(0);
  });
});
