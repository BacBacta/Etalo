/**
 * Vitest specs for OrderDeliveryAddressCard — Sprint J11.7 Block 8.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  OrderDeliveryAddressCard,
  type DeliveryAddressSnapshot,
} from "@/components/orders/OrderDeliveryAddressCard";

const FULL_SNAPSHOT: DeliveryAddressSnapshot = {
  phone_number: "+2349011234567",
  country: "NGA",
  city: "Lagos",
  region: "Lagos State",
  address_line: "12 Allen Avenue, Ikeja",
  landmark: "Near central pharmacy",
  notes: "Ring twice",
};

describe("OrderDeliveryAddressCard", () => {
  it("renders all fields when snapshot is fully populated", () => {
    render(<OrderDeliveryAddressCard snapshot={FULL_SNAPSHOT} orderId={42} />);
    expect(screen.getByTestId("order-delivery-card")).toBeDefined();
    expect(screen.getByText(/Lagos, Nigeria/)).toBeDefined();
    expect(screen.getByText("Lagos State")).toBeDefined();
    expect(screen.getByText("12 Allen Avenue, Ikeja")).toBeDefined();
    expect(screen.getByText("Near central pharmacy")).toBeDefined();
    expect(screen.getByText("+2349011234567")).toBeDefined();
    expect(screen.getByText("Ring twice")).toBeDefined();
  });

  it("renders gracefully when landmark + notes are null", () => {
    const partial: DeliveryAddressSnapshot = {
      ...FULL_SNAPSHOT,
      landmark: null,
      notes: null,
    };
    render(<OrderDeliveryAddressCard snapshot={partial} orderId={42} />);
    expect(screen.queryByTestId("order-delivery-landmark")).toBeNull();
    expect(screen.queryByTestId("order-delivery-notes")).toBeNull();
    // Required fields still render.
    expect(screen.getByTestId("order-delivery-line")).toBeDefined();
  });

  it("renders the WhatsApp button with the correct deeplink href", () => {
    render(<OrderDeliveryAddressCard snapshot={FULL_SNAPSHOT} orderId={42} />);
    const anchor = screen.getByTestId(
      "order-delivery-whatsapp",
    ) as HTMLAnchorElement;
    expect(anchor.tagName).toBe("A");
    const href = anchor.getAttribute("href")!;
    expect(href).toMatch(/^https:\/\/wa\.me\/2349011234567\?text=/);
    expect(href).toContain("Etalo%20order%20%2342");
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders neutral pre-fund message when snapshot is null", () => {
    render(<OrderDeliveryAddressCard snapshot={null} orderId={42} />);
    expect(screen.getByTestId("order-delivery-empty")).toBeDefined();
    expect(
      screen.getByText(/will appear once the buyer funds the order/),
    ).toBeDefined();
    // No WhatsApp button when there's no snapshot.
    expect(screen.queryByTestId("order-delivery-whatsapp")).toBeNull();
  });

  it("hides the WhatsApp button when phone is missing", () => {
    const noPhone: DeliveryAddressSnapshot = {
      ...FULL_SNAPSHOT,
      phone_number: null,
    };
    render(<OrderDeliveryAddressCard snapshot={noPhone} orderId={42} />);
    expect(screen.queryByTestId("order-delivery-whatsapp")).toBeNull();
    // Other fields still render.
    expect(screen.getByText("12 Allen Avenue, Ikeja")).toBeDefined();
  });
});
