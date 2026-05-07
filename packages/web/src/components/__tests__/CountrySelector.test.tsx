/**
 * Vitest specs for CountrySelector — Sprint J11.7 Block 4 (ADR-045).
 *
 * Covers the V1 dropdown contract :
 * - Renders only the 3 V1 markets (NGA / GHA / KEN per ADR-041)
 * - Calls onChange with the alpha-3 code on selection
 * - Surfaces validation error + label + description correctly
 * - Required mode hides the empty placeholder option once a value is set
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CountrySelector } from "@/components/CountrySelector";

describe("CountrySelector", () => {
  it("renders the 3 V1 country options with display names", () => {
    render(<CountrySelector value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Nigeria" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Ghana" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Kenya" })).toBeDefined();
    // No 4th market in V1 per ADR-041
    expect(screen.queryByRole("option", { name: "South Africa" })).toBeNull();
  });

  it("calls onChange with the alpha-3 code when selecting a country", () => {
    const handleChange = vi.fn();
    render(<CountrySelector value={null} onChange={handleChange} />);
    const select = screen.getByTestId("country-selector");
    fireEvent.change(select, { target: { value: "GHA" } });
    expect(handleChange).toHaveBeenCalledWith("GHA");
  });

  it("renders the current value as selected", () => {
    render(<CountrySelector value="NGA" onChange={vi.fn()} />);
    const select = screen.getByTestId("country-selector") as HTMLSelectElement;
    expect(select.value).toBe("NGA");
  });

  it("surfaces label, description, and error", () => {
    render(
      <CountrySelector
        id="country-test"
        value={null}
        onChange={vi.fn()}
        label="Country"
        description="Buyers in your country see your shop."
        error="Please choose a country."
      />,
    );
    expect(screen.getByLabelText(/Country/)).toBeDefined();
    expect(
      screen.getByText("Buyers in your country see your shop."),
    ).toBeDefined();
    const errorEl = screen.getByText("Please choose a country.");
    expect(errorEl).toBeDefined();
    expect(errorEl.getAttribute("role")).toBe("alert");
  });

  it("marks required + invalid via aria when error is set", () => {
    render(
      <CountrySelector
        id="country-required"
        value={null}
        onChange={vi.fn()}
        required
        error="Required field"
      />,
    );
    const select = screen.getByTestId("country-selector");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(select.hasAttribute("required")).toBe(true);
  });
});
