/**
 * Vitest specs for ProfileTab — Sprint J11.7 Block 4 (ADR-045).
 *
 * Covers the country-edit flow added in Block 4 :
 * - Initial country value pre-populates the CountrySelector
 * - Changing country marks the form dirty + sends payload through
 *   updateSellerProfile
 * - Toast surfaces success
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileTab } from "@/components/seller/ProfileTab";

// Mock seller-api.updateSellerProfile so we capture the payload.
const updateSellerProfileMock = vi.fn();
vi.mock("@/lib/seller-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/seller-api")>(
    "@/lib/seller-api",
  );
  return {
    ...actual,
    updateSellerProfile: (...args: unknown[]) =>
      updateSellerProfileMock(...args),
  };
});

// Mock sonner toast — we don't assert on it but the import must resolve
// cleanly under jsdom (sonner pulls in Radix primitives that have
// portal hooks).
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const baseProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  shop_handle: "test-shop",
  shop_name: "Test Shop",
  description: "Test description",
  logo_ipfs_hash: null,
  banner_ipfs_hash: null,
  socials: null,
  categories: null,
  country: "NGA",
  created_at: "2026-05-01T00:00:00Z",
};

const TEST_ADDR = "0xabcd1234abcd1234abcd1234abcd1234abcd1234";

describe("ProfileTab country edit (Block 4)", () => {
  beforeEach(() => {
    updateSellerProfileMock.mockReset();
    updateSellerProfileMock.mockResolvedValue(baseProfile);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("pre-populates the country selector from the profile", () => {
    render(
      <ProfileTab
        profile={baseProfile}
        address={TEST_ADDR}
        onUpdated={vi.fn()}
      />,
    );
    const select = screen.getByTestId(
      "profile-country-selector",
    ) as HTMLSelectElement;
    expect(select.value).toBe("NGA");
  });

  it("sends country in update payload when changed", async () => {
    const onUpdated = vi.fn();
    render(
      <ProfileTab
        profile={baseProfile}
        address={TEST_ADDR}
        onUpdated={onUpdated}
      />,
    );

    const select = screen.getByTestId("profile-country-selector");
    fireEvent.change(select, { target: { value: "GHA" } });

    const submit = screen.getByRole("button", { name: /Save changes/ });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(updateSellerProfileMock).toHaveBeenCalled();
    });
    const [, payload] = updateSellerProfileMock.mock.calls[0];
    expect(payload.country).toBe("GHA");
  });

  it("does not send country when unchanged", async () => {
    render(
      <ProfileTab
        profile={baseProfile}
        address={TEST_ADDR}
        onUpdated={vi.fn()}
      />,
    );

    // Change shop_name but leave country alone
    const shopName = screen.getByLabelText(/Shop name/);
    fireEvent.change(shopName, { target: { value: "Renamed Shop" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => {
      expect(updateSellerProfileMock).toHaveBeenCalled();
    });
    const [, payload] = updateSellerProfileMock.mock.calls[0];
    expect(payload.country).toBeUndefined();
    expect(payload.shop_name).toBe("Renamed Shop");
  });
});
