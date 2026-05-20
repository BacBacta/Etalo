/**
 * Vitest specs for CreateShopForm.
 *
 * Covers the new self-service shop creation path :
 * - The CTA is disabled until shop_name + handle + country are valid
 * - Handle is auto-derived from shop name until the user edits it
 * - Submitting calls createSellerProfile with the expected payload
 *   (and crucially WITHOUT `first_product` — decoupled per the user's
 *   "create boutique first, products later" requirement)
 * - 409 "handle taken" surfaces an inline field error, not a generic
 *   toast
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateShopForm } from "@/components/seller/CreateShopForm";
import { ShopHandleTakenError } from "@/lib/seller-api";

const createSellerProfileMock = vi.fn();
vi.mock("@/lib/seller-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/seller-api")>(
    "@/lib/seller-api",
  );
  return {
    ...actual,
    createSellerProfile: (...args: unknown[]) =>
      createSellerProfileMock(...args),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const TEST_ADDR = "0xabcd1234abcd1234abcd1234abcd1234abcd1234";

const fakeProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  shop_handle: "mama-adaeze",
  shop_name: "Mama Adaeze",
  description: null,
  logo_ipfs_hash: null,
  banner_ipfs_hash: null,
  socials: null,
  categories: null,
  country: "NGA",
  created_at: "2026-05-01T00:00:00Z",
};

function fillRequired() {
  fireEvent.change(screen.getByTestId("create-shop-name"), {
    target: { value: "Mama Adaeze" },
  });
  fireEvent.change(screen.getByTestId("create-shop-country"), {
    target: { value: "NGA" },
  });
}

describe("CreateShopForm", () => {
  beforeEach(() => {
    createSellerProfileMock.mockReset();
    createSellerProfileMock.mockResolvedValue(fakeProfile);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("disables submit until required fields are valid", () => {
    render(<CreateShopForm walletAddress={TEST_ADDR} onCreated={vi.fn()} />);
    const submit = screen.getByTestId(
      "create-shop-submit",
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fillRequired();
    expect(submit.disabled).toBe(false);
  });

  it("auto-suggests the handle from the shop name", () => {
    render(<CreateShopForm walletAddress={TEST_ADDR} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByTestId("create-shop-name"), {
      target: { value: "Mama Adaeze's Boutique" },
    });
    const handle = screen.getByTestId("create-shop-handle") as HTMLInputElement;
    expect(handle.value).toBe("mama-adaeze-s-boutique");
  });

  it("submits without first_product", async () => {
    const onCreated = vi.fn();
    render(
      <CreateShopForm walletAddress={TEST_ADDR} onCreated={onCreated} />,
    );
    fillRequired();
    fireEvent.click(screen.getByTestId("create-shop-submit"));

    await waitFor(() => {
      expect(createSellerProfileMock).toHaveBeenCalled();
    });
    const [addr, payload] = createSellerProfileMock.mock.calls[0];
    expect(addr).toBe(TEST_ADDR);
    expect(payload.shop_name).toBe("Mama Adaeze");
    expect(payload.shop_handle).toBe("mama-adaeze");
    expect(payload.country).toBe("NGA");
    // Critical : no product info is sent. Backend treats `first_product`
    // as optional, so the boutique is created standalone.
    expect("first_product" in payload).toBe(false);
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(fakeProfile);
    });
  });

  it("surfaces 'handle taken' as an inline field error", async () => {
    createSellerProfileMock.mockRejectedValueOnce(new ShopHandleTakenError());
    render(<CreateShopForm walletAddress={TEST_ADDR} onCreated={vi.fn()} />);
    fillRequired();
    fireEvent.click(screen.getByTestId("create-shop-submit"));

    const error = await screen.findByTestId("create-shop-handle-error");
    expect(error.textContent).toMatch(/handle is already taken/i);
  });
});
