/**
 * Vitest specs for CheckoutDeliveryAddressStep — Sprint J11.7 Block 7
 * (ADR-044 + ADR-045).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CheckoutDeliveryAddressStep,
  isCheckoutAddressReady,
} from "@/components/checkout/CheckoutDeliveryAddressStep";
import type { DeliveryAddress } from "@/lib/addresses/api";
import type { UserMe } from "@/lib/buyer-country";

const fetchAddressesMock = vi.fn();
const fetchMyUserMock = vi.fn();
const updateMyUserMock = vi.fn();
const createAddressMock = vi.fn();
const updateAddressMock = vi.fn();

vi.mock("@/lib/addresses/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/addresses/api")>(
    "@/lib/addresses/api",
  );
  return {
    ...actual,
    fetchAddresses: (...args: unknown[]) => fetchAddressesMock(...args),
    createAddress: (...args: unknown[]) => createAddressMock(...args),
    updateAddress: (...args: unknown[]) => updateAddressMock(...args),
  };
});

vi.mock("@/lib/buyer-country", async () => {
  const actual = await vi.importActual<typeof import("@/lib/buyer-country")>(
    "@/lib/buyer-country",
  );
  return {
    ...actual,
    fetchMyUser: (...args: unknown[]) => fetchMyUserMock(...args),
    updateMyUser: (...args: unknown[]) => updateMyUserMock(...args),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const TEST_WALLET = "0xabc1234567890abcdef1234567890abcdef12345";

const NGA_ADDR: DeliveryAddress = {
  id: "addr-nga",
  phone_number: "+2348012345678",
  country: "NGA",
  city: "Lagos",
  region: "Lagos State",
  address_line: "12 Allen Avenue",
  landmark: null,
  notes: null,
  is_default: true,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const GHA_ADDR: DeliveryAddress = {
  ...NGA_ADDR,
  id: "addr-gha",
  country: "GHA",
  city: "Accra",
  region: "Greater Accra",
  is_default: false,
};

const NGA_USER: UserMe = {
  id: "u-1",
  wallet_address: TEST_WALLET,
  country: "NGA",
  language: "en",
  has_seller_profile: false,
  created_at: "2026-05-01T00:00:00Z",
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

describe("CheckoutDeliveryAddressStep", () => {
  beforeEach(() => {
    fetchAddressesMock.mockReset();
    fetchMyUserMock.mockReset();
    fetchMyUserMock.mockResolvedValue(NGA_USER);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when buyer has no addresses", async () => {
    fetchAddressesMock.mockResolvedValue({ items: [], count: 0 });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <CheckoutDeliveryAddressStep
          wallet={TEST_WALLET}
          selectedId={null}
          onSelectedChange={vi.fn()}
        />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("checkout-delivery-empty")).toBeDefined();
    });
    expect(screen.getByTestId("checkout-add-address")).toBeDefined();
  });

  it("renders the address selector when at least one address exists", async () => {
    fetchAddressesMock.mockResolvedValue({
      items: [NGA_ADDR],
      count: 1,
    });
    const onSelectedChange = vi.fn();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <CheckoutDeliveryAddressStep
          wallet={TEST_WALLET}
          selectedId={null}
          onSelectedChange={onSelectedChange}
        />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("address-selector-list")).toBeDefined();
    });
    // Auto-pick default on first load
    await waitFor(() => {
      expect(onSelectedChange).toHaveBeenCalledWith(NGA_ADDR.id);
    });
  });

  it("flags country mismatch when picked address country !== buyer country", async () => {
    fetchAddressesMock.mockResolvedValue({
      items: [NGA_ADDR, GHA_ADDR],
      count: 2,
    });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <CheckoutDeliveryAddressStep
          wallet={TEST_WALLET}
          selectedId={GHA_ADDR.id}
          onSelectedChange={vi.fn()}
          expectedCountry="NGA"
        />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("checkout-country-mismatch")).toBeDefined();
    });
    expect(
      screen.getByText(/seller delivers only in Nigeria/),
    ).toBeDefined();
  });

  it("does NOT flag mismatch when address country matches buyer country", async () => {
    fetchAddressesMock.mockResolvedValue({
      items: [NGA_ADDR],
      count: 1,
    });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <CheckoutDeliveryAddressStep
          wallet={TEST_WALLET}
          selectedId={NGA_ADDR.id}
          onSelectedChange={vi.fn()}
          expectedCountry="NGA"
        />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("address-selector-list")).toBeDefined();
    });
    expect(screen.queryByTestId("checkout-country-mismatch")).toBeNull();
  });

  it("opens the add-address modal when clicking the Add CTA", async () => {
    fetchAddressesMock.mockResolvedValue({ items: [], count: 0 });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <CheckoutDeliveryAddressStep
          wallet={TEST_WALLET}
          selectedId={null}
          onSelectedChange={vi.fn()}
        />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("checkout-add-address")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("checkout-add-address"));
    // Modal opens with the form fields
    await waitFor(() => {
      expect(screen.getByTestId("addr-phone")).toBeDefined();
    });
  });
});

describe("isCheckoutAddressReady", () => {
  it("returns false when no address is selected", () => {
    expect(
      isCheckoutAddressReady({
        selectedId: null,
        selectedCountry: null,
        expectedCountry: "NGA",
      }),
    ).toBe(false);
  });

  it("returns true when an address is picked and countries match", () => {
    expect(
      isCheckoutAddressReady({
        selectedId: "x",
        selectedCountry: "NGA",
        expectedCountry: "NGA",
      }),
    ).toBe(true);
  });

  it("returns false on country mismatch", () => {
    expect(
      isCheckoutAddressReady({
        selectedId: "x",
        selectedCountry: "GHA",
        expectedCountry: "NGA",
      }),
    ).toBe(false);
  });

  it("returns true when expectedCountry is unknown (no guard)", () => {
    expect(
      isCheckoutAddressReady({
        selectedId: "x",
        selectedCountry: "NGA",
        expectedCountry: null,
      }),
    ).toBe(true);
  });
});
