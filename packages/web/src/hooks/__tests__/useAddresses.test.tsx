/**
 * Vitest specs for useAddresses + mutations — Sprint J11.7 Block 6 (ADR-044).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useSetDefaultAddress,
} from "@/hooks/useAddresses";
import type { DeliveryAddress } from "@/lib/addresses/api";

const fetchAddressesMock = vi.fn();
const createAddressMock = vi.fn();
const deleteAddressMock = vi.fn();
const setDefaultAddressMock = vi.fn();

vi.mock("@/lib/addresses/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/addresses/api")>(
    "@/lib/addresses/api",
  );
  return {
    ...actual,
    fetchAddresses: (...args: unknown[]) => fetchAddressesMock(...args),
    createAddress: (...args: unknown[]) => createAddressMock(...args),
    deleteAddress: (...args: unknown[]) => deleteAddressMock(...args),
    setDefaultAddress: (...args: unknown[]) => setDefaultAddressMock(...args),
  };
});

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

const TEST_WALLET = "0xabc1234567890abcdef1234567890abcdef12345";

const SAMPLE_ADDR: DeliveryAddress = {
  id: "00000000-0000-0000-0000-000000000001",
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

describe("useAddresses", () => {
  beforeEach(() => {
    fetchAddressesMock.mockReset();
    createAddressMock.mockReset();
    deleteAddressMock.mockReset();
    setDefaultAddressMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when wallet is undefined", () => {
    const wrapper = makeWrapper();
    renderHook(() => useAddresses({ wallet: undefined }), { wrapper });
    expect(fetchAddressesMock).not.toHaveBeenCalled();
  });

  it("returns the address list when wallet is set", async () => {
    fetchAddressesMock.mockResolvedValue({
      items: [SAMPLE_ADDR],
      count: 1,
    });
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useAddresses({ wallet: TEST_WALLET }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.count).toBe(1);
    expect(result.current.data?.items[0].id).toBe(SAMPLE_ADDR.id);
  });
});

describe("useCreateAddress", () => {
  beforeEach(() => {
    createAddressMock.mockReset();
  });

  it("calls createAddress and resolves with the new row", async () => {
    createAddressMock.mockResolvedValue(SAMPLE_ADDR);
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useCreateAddress({ wallet: TEST_WALLET }),
      { wrapper },
    );
    let saved: DeliveryAddress | undefined;
    await act(async () => {
      saved = await result.current.mutateAsync({
        phone_number: "+2348012345678",
        country: "NGA",
        city: "Lagos",
        region: "Lagos State",
        address_line: "12 Allen Avenue",
      });
    });
    expect(createAddressMock).toHaveBeenCalled();
    expect(saved?.id).toBe(SAMPLE_ADDR.id);
  });
});

describe("useDeleteAddress", () => {
  it("calls deleteAddress with id", async () => {
    deleteAddressMock.mockResolvedValue(undefined);
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useDeleteAddress({ wallet: TEST_WALLET }),
      { wrapper },
    );
    await act(async () => {
      await result.current.mutateAsync(SAMPLE_ADDR.id);
    });
    expect(deleteAddressMock).toHaveBeenCalledWith(TEST_WALLET, SAMPLE_ADDR.id);
  });
});

describe("useSetDefaultAddress", () => {
  it("calls setDefaultAddress with id", async () => {
    setDefaultAddressMock.mockResolvedValue({
      ...SAMPLE_ADDR,
      is_default: true,
    });
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useSetDefaultAddress({ wallet: TEST_WALLET }),
      { wrapper },
    );
    await act(async () => {
      await result.current.mutateAsync(SAMPLE_ADDR.id);
    });
    expect(setDefaultAddressMock).toHaveBeenCalledWith(
      TEST_WALLET,
      SAMPLE_ADDR.id,
    );
  });
});
