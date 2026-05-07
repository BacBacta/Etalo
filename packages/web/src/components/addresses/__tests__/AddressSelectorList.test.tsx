/**
 * Vitest specs for AddressSelectorList — Sprint J11.7 Block 6 (ADR-044).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddressSelectorList } from "@/components/addresses/AddressSelectorList";
import type { DeliveryAddress } from "@/lib/addresses/api";

const A: DeliveryAddress = {
  id: "addr-a",
  phone_number: "+2348012345678",
  country: "NGA",
  city: "Lagos",
  region: "Lagos State",
  address_line: "12 Allen",
  landmark: null,
  notes: null,
  is_default: true,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};
const B: DeliveryAddress = {
  ...A,
  id: "addr-b",
  city: "Abuja",
  region: "FCT",
  address_line: "Plot 42",
  is_default: false,
};

describe("AddressSelectorList", () => {
  it("returns null when there are no addresses", () => {
    const { container } = render(
      <AddressSelectorList
        addresses={[]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one row per address with a radio input", () => {
    render(
      <AddressSelectorList
        addresses={[A, B]}
        selectedId={A.id}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId(`address-selector-row-${A.id}`)).toBeDefined();
    expect(screen.getByTestId(`address-selector-row-${B.id}`)).toBeDefined();
    const radioA = screen.getByTestId(
      `address-selector-radio-${A.id}`,
    ) as HTMLInputElement;
    expect(radioA.checked).toBe(true);
  });

  it("invokes onSelect with the radio id when the user clicks", () => {
    const handleSelect = vi.fn();
    render(
      <AddressSelectorList
        addresses={[A, B]}
        selectedId={A.id}
        onSelect={handleSelect}
      />,
    );
    fireEvent.click(screen.getByTestId(`address-selector-radio-${B.id}`));
    expect(handleSelect).toHaveBeenCalledWith(B.id);
  });
});
