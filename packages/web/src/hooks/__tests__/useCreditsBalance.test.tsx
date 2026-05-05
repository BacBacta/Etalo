/**
 * Vitest specs for useCreditsBalance (J10-V5 Phase 5 polish item B).
 *
 * Mirrors useAnalyticsSummary's QueryClient-per-test pattern so cache
 * never leaks across specs. Wagmi's useAccount is mocked at the module
 * boundary so we can flip the address per-spec without spinning up a
 * full WagmiProvider.
 *
 * Coverage :
 *   - `enabled` gate suppresses fetch until wagmi resolves an address
 *   - First-pass fetch fires once, queryFn forwards the address
 *   - queryClient.invalidateQueries on CREDITS_BALANCE_QUERY_KEY
 *     forces a refetch (the post-purchase polling contract from
 *     CreditsBalance.tsx)
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CREDITS_BALANCE_QUERY_KEY,
  useCreditsBalance,
} from "@/hooks/useCreditsBalance";

const fetchCreditsBalanceMock = vi.fn();
const useAccountMock = vi.fn();

vi.mock("@/lib/marketing-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/marketing-api")>(
      "@/lib/marketing-api",
    );
  return {
    ...actual,
    fetchCreditsBalance: (...args: unknown[]) =>
      fetchCreditsBalanceMock(...args),
  };
});

vi.mock("wagmi", () => ({
  useAccount: () => useAccountMock(),
}));

const SAMPLE_WALLET = "0xabc0000000000000000000000000000000000001";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return { Wrapper, client };
}

beforeEach(() => {
  fetchCreditsBalanceMock.mockReset();
  useAccountMock.mockReset();
  useAccountMock.mockReturnValue({ address: SAMPLE_WALLET });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useCreditsBalance — gating", () => {
  it("does NOT fire the query when wagmi has no address yet", () => {
    useAccountMock.mockReturnValue({ address: undefined });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreditsBalance(), {
      wrapper: Wrapper,
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchCreditsBalanceMock).not.toHaveBeenCalled();
  });

  it("fires the query exactly once when an address is present", async () => {
    fetchCreditsBalanceMock.mockResolvedValue({
      balance: 15,
      wallet_address: SAMPLE_WALLET,
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreditsBalance(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchCreditsBalanceMock).toHaveBeenCalledTimes(1);
    expect(fetchCreditsBalanceMock).toHaveBeenCalledWith(SAMPLE_WALLET);
    expect(result.current.data).toEqual({
      balance: 15,
      wallet_address: SAMPLE_WALLET,
    });
  });
});

describe("useCreditsBalance — invalidation contract", () => {
  it("queryClient.invalidateQueries on CREDITS_BALANCE_QUERY_KEY triggers a refetch", async () => {
    fetchCreditsBalanceMock
      .mockResolvedValueOnce({ balance: 15, wallet_address: SAMPLE_WALLET })
      .mockResolvedValueOnce({ balance: 25, wallet_address: SAMPLE_WALLET });
    const { Wrapper, client } = makeWrapper();
    const { result } = renderHook(() => useCreditsBalance(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.balance).toBe(15);

    await act(async () => {
      await client.invalidateQueries({
        queryKey: [CREDITS_BALANCE_QUERY_KEY],
      });
    });

    await waitFor(() =>
      expect(fetchCreditsBalanceMock).toHaveBeenCalledTimes(2),
    );
    expect(result.current.data?.balance).toBe(25);
  });
});
