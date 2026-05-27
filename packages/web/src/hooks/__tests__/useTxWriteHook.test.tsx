/**
 * useTxWriteHook specs — focus on the burstPollOnSuccess behavior
 * introduced in Block B of the J12-pre reactivity sprint. The
 * surrounding tx state machine (idle → preparing → confirming →
 * success) is covered indirectly via the consumer hook tests
 * (useConfirmDelivery, useClaimRefund, useOpenDispute, …) ; here we
 * specifically assert that after a successful tx, the configured
 * query keys are re-invalidated at `intervalMs` for `durationMs`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTxWriteHook } from "@/hooks/useTxWriteHook";

const writeContractMock = vi.fn();
const waitForReceiptMock = vi.fn();
const resolveWalletClientMock = vi.fn();

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }),
  useChainId: () => 11142220, // Celo Sepolia
  usePublicClient: () => ({
    waitForTransactionReceipt: waitForReceiptMock,
  }),
}));

vi.mock("@/hooks/useResolvedWalletClient", () => ({
  useResolvedWalletClient: () => ({
    resolve: resolveWalletClientMock,
  }),
}));

vi.mock("@/lib/chain", () => ({
  etaloChain: { id: 11142220, name: "Celo Sepolia" },
}));

vi.mock("@/lib/tx", () => ({
  asTxOptions: (opts: unknown) => opts,
}));

vi.mock("@/lib/checkout-errors", () => ({
  classifyCheckoutError: (err: unknown) => ({
    code: "unknown",
    message: err instanceof Error ? err.message : "Unknown error",
  }),
}));

const TEST_ADDRESS = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca" as const;

function makeWrapper(client: QueryClient) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

describe("useTxWriteHook burstPollOnSuccess", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeContractMock.mockReset();
    waitForReceiptMock.mockReset();
    resolveWalletClientMock.mockReset();
    resolveWalletClientMock.mockResolvedValue({
      writeContract: writeContractMock,
      account: { address: "0x1111111111111111111111111111111111111111" },
    });
    writeContractMock.mockResolvedValue("0xdeadbeef");
    waitForReceiptMock.mockResolvedValue({ status: "success" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("invalidates burst keys repeatedly over the configured duration", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useTxWriteHook<{ orderId: bigint }>({
          address: TEST_ADDRESS,
          abi: [],
          functionName: "noop",
          buildArgs: ({ orderId }) => [orderId],
          burstPollOnSuccess: {
            keys: [["k1"]],
            intervalMs: 5_000,
            durationMs: 30_000,
          },
        }),
      { wrapper: makeWrapper(client) },
    );

    await act(async () => {
      await result.current.run({ orderId: 1n });
    });

    // Immediate post-success kick.
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["k1"] });

    // Advance through the 30 s burst window : 5_000 ms increments
    // → 6 additional fires (5, 10, 15, 20, 25, 30).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(7);

    // Past the window — no further fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(7);
  });

  it("invalidates each configured key on every burst tick", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useTxWriteHook<Record<string, never>>({
          address: TEST_ADDRESS,
          abi: [],
          functionName: "noop",
          buildArgs: () => [],
          burstPollOnSuccess: {
            keys: [["k1"], ["k2"]],
            intervalMs: 5_000,
            durationMs: 10_000,
          },
        }),
      { wrapper: makeWrapper(client) },
    );

    await act(async () => {
      await result.current.run({});
    });

    // Initial kick : 2 keys × 1 = 2 invalidations.
    expect(invalidateSpy).toHaveBeenCalledTimes(2);

    // After 10 s : 2 keys × 2 more ticks = 4 additional → 6 total.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(6);
  });

  it("does not start a burst when burstPollOnSuccess is omitted", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useTxWriteHook<Record<string, never>>({
          address: TEST_ADDRESS,
          abi: [],
          functionName: "noop",
          buildArgs: () => [],
          invalidateOnSuccess: [["once"]],
        }),
      { wrapper: makeWrapper(client) },
    );

    await act(async () => {
      await result.current.run({});
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it("cancels the running burst when reset() is called", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useTxWriteHook<Record<string, never>>({
          address: TEST_ADDRESS,
          abi: [],
          functionName: "noop",
          buildArgs: () => [],
          burstPollOnSuccess: {
            keys: [["k1"]],
            intervalMs: 5_000,
            durationMs: 30_000,
          },
        }),
      { wrapper: makeWrapper(client) },
    );

    await act(async () => {
      await result.current.run({});
    });

    // 1 immediate + 2 ticks.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    const countAtReset = invalidateSpy.mock.calls.length;
    expect(countAtReset).toBe(3);

    act(() => {
      result.current.reset();
    });

    // No further fires after reset.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(countAtReset);
  });
});
