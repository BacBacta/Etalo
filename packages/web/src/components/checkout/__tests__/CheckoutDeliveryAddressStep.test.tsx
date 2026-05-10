/**
 * Vitest specs for CheckoutDeliveryAddressStep — ADR-050 (inline
 * checkout pivot, supersedes the J11.7 picker tests).
 *
 * Covers :
 * - inline form renders required fields
 * - readiness gate (isCheckoutAddressReady) accepts a fully-filled
 *   form and rejects a partially-filled one
 * - country mismatch surface (V1 intra-Africa scope, ADR-045)
 *
 * The J11.7 picker tests were dropped because the picker no longer
 * exists in the V1 surface (kept in repo behind feature flag, not
 * rendered by the checkout). Address-book CRUD is exercised by its
 * own AddressBookPage tests when ENABLE_ADDRESS_BOOK is true.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CheckoutDeliveryAddressStep,
  isCheckoutAddressReady,
} from "@/components/checkout/CheckoutDeliveryAddressStep";
import {
  EMPTY_INLINE_DELIVERY_FORM,
  type InlineDeliveryAddressData,
} from "@/components/checkout/InlineDeliveryAddressForm";
import type { UserMe } from "@/lib/buyer-country";

const fetchMyUserMock = vi.fn();

vi.mock("@/lib/buyer-country", async () => {
  const actual = await vi.importActual<typeof import("@/lib/buyer-country")>(
    "@/lib/buyer-country",
  );
  return {
    ...actual,
    fetchMyUser: (...args: unknown[]) => fetchMyUserMock(...args),
  };
});

const TEST_WALLET = "0xabc1234567890abcdef1234567890abcdef12345";

function makeUserMe(country: string | null = "NGA"): UserMe {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    wallet_address: TEST_WALLET,
    country,
    language: "en",
    has_seller_profile: false,
    created_at: "2026-05-10T00:00:00Z",
  };
}

function renderWithQueryClient(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  return render(
    <QueryClientProvider client={qc}>{node}</QueryClientProvider>,
  );
}

const VALID_FORM: InlineDeliveryAddressData = {
  recipient_name: "Adaeze Okafor",
  phone_number: "+234 80 1234 5678",
  country: "NGA",
  region: "Lagos State",
  city: "Lagos",
  area: "Lekki Phase 1",
  address_line: "Plot 12B, off Adeola Odeku Street",
  landmark: "Behind the blue gate",
  notes: "",
};

beforeEach(() => {
  fetchMyUserMock.mockReset();
  fetchMyUserMock.mockResolvedValue(makeUserMe("NGA"));
  if (typeof window !== "undefined") {
    window.sessionStorage.clear();
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CheckoutDeliveryAddressStep — inline form (ADR-050)", () => {
  it("renders the inline delivery form with the recipient_name input", () => {
    const onChange = vi.fn();
    renderWithQueryClient(
      <CheckoutDeliveryAddressStep
        wallet={TEST_WALLET}
        value={EMPTY_INLINE_DELIVERY_FORM}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("checkout-delivery-step")).toBeInTheDocument();
    expect(screen.getByTestId("inline-delivery-form")).toBeInTheDocument();
    expect(
      screen.getByTestId("inline-delivery-recipient-name"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("inline-delivery-area")).toBeInTheDocument();
  });

  it("calls onChange when the recipient name is edited", () => {
    const onChange = vi.fn();
    renderWithQueryClient(
      <CheckoutDeliveryAddressStep
        wallet={TEST_WALLET}
        value={EMPTY_INLINE_DELIVERY_FORM}
        onChange={onChange}
      />,
    );
    const input = screen.getByTestId(
      "inline-delivery-recipient-name",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Adaeze" } });
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_INLINE_DELIVERY_FORM,
      recipient_name: "Adaeze",
    });
  });
});

describe("isCheckoutAddressReady — inline form readiness", () => {
  it("returns false on empty form", () => {
    expect(
      isCheckoutAddressReady({
        formData: EMPTY_INLINE_DELIVERY_FORM,
        expectedCountry: "NGA",
      }),
    ).toBe(false);
  });

  it("returns true on fully-filled form matching expected country", () => {
    expect(
      isCheckoutAddressReady({
        formData: VALID_FORM,
        expectedCountry: "NGA",
      }),
    ).toBe(true);
  });

  it("returns false when country mismatches expected country", () => {
    expect(
      isCheckoutAddressReady({
        formData: { ...VALID_FORM, country: "KEN" },
        expectedCountry: "NGA",
      }),
    ).toBe(false);
  });

  it("returns false when a required field is whitespace-only", () => {
    expect(
      isCheckoutAddressReady({
        formData: { ...VALID_FORM, recipient_name: "   " },
        expectedCountry: "NGA",
      }),
    ).toBe(false);
  });

  it("returns true when expectedCountry is null (no guard)", () => {
    expect(
      isCheckoutAddressReady({
        formData: VALID_FORM,
        expectedCountry: null,
      }),
    ).toBe(true);
  });
});
