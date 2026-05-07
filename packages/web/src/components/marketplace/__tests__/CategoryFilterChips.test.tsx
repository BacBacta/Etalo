/**
 * Vitest specs for CategoryFilterChips — marketplace UX pass + filters.
 *
 * Mirrors the CountryFilterChips contract (radiogroup with
 * aria-checked, click → onChange) — the chip is a thin transform of
 * the same primitive over the V1 ProductCategory enum.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryFilterChips } from "@/components/marketplace/CategoryFilterChips";

describe("CategoryFilterChips", () => {
  it("renders the All chip + every V1 category in a radiogroup", () => {
    render(<CategoryFilterChips value="all" onChange={vi.fn()} />);
    const group = screen.getByRole("radiogroup", {
      name: /Filter by category/i,
    });
    expect(group).toBeInTheDocument();
    // 1 All + 5 categories = 6 chips.
    expect(screen.getByTestId("category-chip-all")).toBeInTheDocument();
    expect(screen.getByTestId("category-chip-fashion")).toBeInTheDocument();
    expect(screen.getByTestId("category-chip-beauty")).toBeInTheDocument();
    expect(screen.getByTestId("category-chip-food")).toBeInTheDocument();
    expect(screen.getByTestId("category-chip-home")).toBeInTheDocument();
    expect(screen.getByTestId("category-chip-other")).toBeInTheDocument();
  });

  it("flags the active chip via aria-checked='true' and the others 'false'", () => {
    render(<CategoryFilterChips value="fashion" onChange={vi.fn()} />);
    expect(screen.getByTestId("category-chip-fashion")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("category-chip-all")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("fires onChange with the chip's category code on click", () => {
    const onChange = vi.fn();
    render(<CategoryFilterChips value="all" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("category-chip-beauty"));
    expect(onChange).toHaveBeenCalledWith("beauty");
  });

  it("clicking the All chip fires onChange with 'all' (clear filter)", () => {
    const onChange = vi.fn();
    render(<CategoryFilterChips value="fashion" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("category-chip-all"));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("disables every chip when `disabled` prop is true", () => {
    render(<CategoryFilterChips value="all" onChange={vi.fn()} disabled />);
    expect(screen.getByTestId("category-chip-fashion")).toBeDisabled();
    expect(screen.getByTestId("category-chip-all")).toBeDisabled();
  });
});
