/**
 * Vitest specs for the FormField helper used by ProductFormDialog
 * (J10-V5 Phase 5 Angle E sub-block E.1.b).
 *
 * Coverage : the helper generates a unique id via useId and threads it
 * through both the <label htmlFor=...> and the child input's `id`, so
 * screen readers + getByLabelText resolve the label↔input association.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormField } from "@/components/seller/ProductFormDialog";

describe("ProductFormDialog — FormField label↔input association (Phase 5 Angle E sub-block E.1.b)", () => {
  it("associates the label with the child input via htmlFor + id (getByLabelText resolves)", () => {
    render(
      <FormField label="Title">
        <input type="text" defaultValue="" />
      </FormField>,
    );
    // getByLabelText only resolves when the label and input are
    // properly associated via htmlFor + id (or implicit nesting). If
    // the FormField helper regresses to the pre-Angle-E orphan
    // <label>{label}</label> sibling pattern, this assertion fails.
    const input = screen.getByLabelText("Title");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  // J10-V5 Phase 5 Angle B Track 2 fix #4 (Option C MVP) — hint text
  // surfaces as the FormField caption when no error is set. Pin the
  // size-info nudge so a future hint-rewrite doesn't silently drop the
  // seller-facing guidance.
  it("renders the hint text below the input when no error is set", () => {
    render(
      <FormField label="Description" hint="Tip: include size info">
        <textarea defaultValue="" />
      </FormField>,
    );
    expect(
      screen.getByText("Tip: include size info"),
    ).toBeInTheDocument();
  });
});
