/**
 * Vitest specs for TemplateSelector (J10-V5 Phase 5 Angle E sub-block E.2).
 *
 * Coverage : the "Choose template" surface exposes the visible label as
 * the accessible name of an ARIA group, so screen readers + automated
 * a11y tools (axe / Lighthouse) recognize the 6-button grid as a single
 * cohesive selection control rather than 6 isolated buttons.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TemplateSelector } from "@/components/seller/marketing/TemplateSelector";

describe("TemplateSelector — accessible group (Phase 5 Angle E sub-block E.2)", () => {
  it("exposes the 'Choose template' label as the group's accessible name via aria-labelledby", () => {
    render(<TemplateSelector selected={null} onSelect={vi.fn()} />);
    // getByRole resolves the role="group" + aria-labelledby pointing at
    // the <span id="template-select-label">. If the legacy <label>
    // sibling pattern regresses, this assertion fails.
    const group = screen.getByRole("group", { name: "Choose template" });
    expect(group).toBeInTheDocument();
  });
});
