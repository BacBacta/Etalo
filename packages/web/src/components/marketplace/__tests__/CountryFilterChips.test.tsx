/**
 * Vitest specs for CountryFilterChips — Sprint J11.7 Block 9 (ADR-045).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CountryFilterChips } from "@/components/marketplace/CountryFilterChips";

describe("CountryFilterChips", () => {
  it("renders the 3 V1 country chips + an All option", () => {
    render(<CountryFilterChips value="all" onChange={vi.fn()} />);
    expect(screen.getByTestId("country-chip-all")).toBeDefined();
    expect(screen.getByTestId("country-chip-NGA")).toBeDefined();
    expect(screen.getByTestId("country-chip-GHA")).toBeDefined();
    expect(screen.getByTestId("country-chip-KEN")).toBeDefined();
  });

  it("marks the active chip via aria-checked", () => {
    render(<CountryFilterChips value="NGA" onChange={vi.fn()} />);
    const ngaChip = screen.getByTestId("country-chip-NGA");
    const allChip = screen.getByTestId("country-chip-all");
    expect(ngaChip.getAttribute("aria-checked")).toBe("true");
    expect(allChip.getAttribute("aria-checked")).toBe("false");
  });

  it("invokes onChange with the country code when a chip is clicked", () => {
    const handleChange = vi.fn();
    render(<CountryFilterChips value="all" onChange={handleChange} />);
    fireEvent.click(screen.getByTestId("country-chip-GHA"));
    expect(handleChange).toHaveBeenCalledWith("GHA");
  });

  it("invokes onChange with 'all' when the All chip is clicked", () => {
    const handleChange = vi.fn();
    render(<CountryFilterChips value="NGA" onChange={handleChange} />);
    fireEvent.click(screen.getByTestId("country-chip-all"));
    expect(handleChange).toHaveBeenCalledWith("all");
  });

  it("disables all chips when disabled=true", () => {
    render(<CountryFilterChips value="all" onChange={vi.fn()} disabled />);
    const ngaChip = screen.getByTestId(
      "country-chip-NGA",
    ) as HTMLButtonElement;
    expect(ngaChip.disabled).toBe(true);
  });

  it("uses display names for chip labels (Nigeria, Ghana, Kenya)", () => {
    render(<CountryFilterChips value="all" onChange={vi.fn()} />);
    expect(screen.getByText("Nigeria")).toBeDefined();
    expect(screen.getByText("Ghana")).toBeDefined();
    expect(screen.getByText("Kenya")).toBeDefined();
    expect(screen.getByText("All countries")).toBeDefined();
  });
});
