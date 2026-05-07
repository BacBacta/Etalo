/**
 * Vitest specs for SortDropdown — marketplace UX pass + filters.
 *
 * Native <select> contract : renders the 3 V1 sort options (newest /
 * price asc / price desc), reflects the controlled `value`, fires
 * onChange with the underlying SortValue on change.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SortDropdown } from "@/components/marketplace/SortDropdown";

describe("SortDropdown", () => {
  it("renders the 3 V1 sort options", () => {
    render(<SortDropdown value="newest" onChange={vi.fn()} />);
    const select = screen.getByTestId("marketplace-sort") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["newest", "price_asc", "price_desc"]);
  });

  it("reflects the controlled `value` prop", () => {
    render(<SortDropdown value="price_asc" onChange={vi.fn()} />);
    const select = screen.getByTestId("marketplace-sort") as HTMLSelectElement;
    expect(select.value).toBe("price_asc");
  });

  it("fires onChange with the new value on change", () => {
    const onChange = vi.fn();
    render(<SortDropdown value="newest" onChange={onChange} />);
    const select = screen.getByTestId("marketplace-sort") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "price_desc" } });
    expect(onChange).toHaveBeenCalledWith("price_desc");
  });

  it("disables the select when `disabled` is true", () => {
    render(<SortDropdown value="newest" onChange={vi.fn()} disabled />);
    expect(screen.getByTestId("marketplace-sort")).toBeDisabled();
  });
});
