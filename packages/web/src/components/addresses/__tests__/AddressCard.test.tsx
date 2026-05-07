/**
 * Vitest specs for AddressCard — Sprint J11.7 Block 6 (ADR-044).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddressCard } from "@/components/addresses/AddressCard";
import type { DeliveryAddress } from "@/lib/addresses/api";

const ADDR: DeliveryAddress = {
  id: "abc-1",
  phone_number: "+2348012345678",
  country: "NGA",
  city: "Lagos",
  region: "Lagos State",
  address_line: "12 Allen Avenue",
  landmark: "Near central pharmacy",
  notes: null,
  is_default: true,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

describe("AddressCard", () => {
  it("renders city, country name, default badge and contact info", () => {
    render(
      <AddressCard
        address={ADDR}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
      />,
    );
    expect(screen.getByText(/Lagos, Nigeria/)).toBeDefined();
    expect(screen.getByText("Default")).toBeDefined();
    expect(screen.getByText(ADDR.phone_number)).toBeDefined();
    expect(
      screen.getByText(/Landmark: Near central pharmacy/),
    ).toBeDefined();
  });

  it("hides Set default button when address is already default", () => {
    render(
      <AddressCard
        address={ADDR}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
      />,
    );
    expect(screen.queryByTestId(`address-set-default-${ADDR.id}`)).toBeNull();
  });

  it("shows Set default button on a non-default address and triggers callback", () => {
    const handleSet = vi.fn();
    render(
      <AddressCard
        address={{ ...ADDR, is_default: false }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={handleSet}
      />,
    );
    fireEvent.click(screen.getByTestId(`address-set-default-${ADDR.id}`));
    expect(handleSet).toHaveBeenCalledWith({ ...ADDR, is_default: false });
  });

  it("triggers onEdit and onDelete callbacks", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <AddressCard
        address={ADDR}
        onEdit={onEdit}
        onDelete={onDelete}
        onSetDefault={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId(`address-edit-${ADDR.id}`));
    expect(onEdit).toHaveBeenCalledWith(ADDR);
    fireEvent.click(screen.getByTestId(`address-delete-${ADDR.id}`));
    expect(onDelete).toHaveBeenCalledWith(ADDR);
  });
});
