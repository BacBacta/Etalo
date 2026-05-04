/**
 * Vitest specs for SkipLink (J10-V5 Phase 5 Angle E sub-block E.1.a).
 *
 * Coverage : skip link is rendered with the correct href + accessible
 * label + sr-only class so it's reachable via Tab from any page,
 * invisible on first paint, and visually revealed when focused.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkipLink } from "@/components/SkipLink";

describe("SkipLink", () => {
  it("renders an anchor pointing to #main with the visible label", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#main");
  });

  it("is sr-only by default (visually hidden, screen-reader reachable)", () => {
    render(<SkipLink />);
    const link = screen.getByTestId("skip-link");
    // sr-only kicks the link out of the visual flow but keeps it in the
    // accessibility tree ; focus:not-sr-only restores it on keyboard focus.
    expect(link.className).toMatch(/\bsr-only\b/);
    expect(link.className).toMatch(/\bfocus:not-sr-only\b/);
  });
});
