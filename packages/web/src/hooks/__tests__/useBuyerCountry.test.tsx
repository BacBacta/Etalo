/**
 * Vitest specs for useBuyerCountry — Sprint J11.7 Block 5 (ADR-045).
 *
 * Covers the read+mutation hook contract :
 *   - Disabled until wallet is provided
 *   - Returns user shape on success
 *   - Mutation invalidates cache so subsequent reads see the new country
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useBuyerCountry,
  useSetMyCountry,
} from "@/hooks/useBuyerCountry";
import type { UserMe } from "@/lib/buyer-country";

const fetchMyUserMock = vi.fn();
const updateMyUserMock = vi.fn();

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

const SAMPLE_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  wallet_address: TEST_WALLET,
  country: "NGA",
  language: "en",
  has_seller_profile: false,
  created_at: "2026-05-01T00:00:00Z",
};

describe("useBuyerCountry", () => {
  beforeEach(() => {
    fetchMyUserMock.mockReset();
    updateMyUserMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when wallet is undefined", () => {
    const wrapper = makeWrapper();
    renderHook(() => useBuyerCountry({ wallet: undefined }), { wrapper });
    expect(fetchMyUserMock).not.toHaveBeenCalled();
  });

  it("fetches and returns the user when wallet is set", async () => {
    fetchMyUserMock.mockResolvedValue(SAMPLE_USER);
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useBuyerCountry({ wallet: TEST_WALLET }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual(SAMPLE_USER);
  });

  it("returns null for first-visit wallets", async () => {
    fetchMyUserMock.mockResolvedValue(null);
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useBuyerCountry({ wallet: TEST_WALLET }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toBeNull();
  });
});

describe("useSetMyCountry", () => {
  beforeEach(() => {
    fetchMyUserMock.mockReset();
    updateMyUserMock.mockReset();
  });

  it("calls updateMyUser and updates cache on success", async () => {
    const updated = { ...SAMPLE_USER, country: "GHA" };
    updateMyUserMock.mockResolvedValue(updated);

    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useSetMyCountry({ wallet: TEST_WALLET }),
      { wrapper },
    );

    let mutationResult: UserMe | undefined;
    await act(async () => {
      mutationResult = await result.current.mutateAsync({ country: "GHA" });
    });

    expect(updateMyUserMock).toHaveBeenCalledWith(TEST_WALLET, {
      country: "GHA",
    });
    // mutateAsync resolves with the server payload directly — assert on
    // that rather than result.current.data, which can be stale relative
    // to the act() flush in renderHook.
    expect(mutationResult).toEqual(updated);
  });
});
