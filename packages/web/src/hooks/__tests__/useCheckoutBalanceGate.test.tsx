/**
 * Vitest specs for useCheckoutBalanceGate (J11 #1 — Add Cash gate).
 *
 * Mocks wagmi at the module boundary. Asserts the 3 phase-classification
 * cases (loading / sufficient / insufficient), the boundary equivalence
 * (exact match), the no-buyer case, and that the cache options
 * (staleTime: 0, refetchOnWindowFocus, refetchOnReconnect) are
 * propagated to useReadContract.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCheckoutBalanceGate } from "@/hooks/useCheckoutBalanceGate";

const BUYER = "0xabc0000000000000000000000000000000000001" as const;
const USDT = "0xea07db5d3D7576864ac434133abFE0E815735300" as const;

vi.stubEnv("NEXT_PUBLIC_USDT_ADDRESS", USDT);

const accountMock = vi.fn();
const readContractMock = vi.fn();

vi.mock("wagmi", () => ({
  useAccount: () => accountMock(),
  useReadContract: (args: unknown) => readContractMock(args),
}));

beforeEach(() => {
  accountMock.mockReset();
  readContractMock.mockReset();
  // Default : connected buyer.
  accountMock.mockReturnValue({ address: BUYER });
});

describe("useCheckoutBalanceGate — phase classification", () => {
  it("isLoading initial — useReadContract isPending=true", () => {
    readContractMock.mockReturnValue({ data: undefined, isPending: true });

    const { result } = renderHook(() =>
      useCheckoutBalanceGate(50_000_000n),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasInsufficient).toBe(false);
    expect(result.current.deficitRaw).toBe(0n);
    expect(result.current.balanceRaw).toBeUndefined();
  });

  it("sufficient — balance > required", () => {
    readContractMock.mockReturnValue({
      data: 100_000_000n,
      isPending: false,
    });

    const { result } = renderHook(() =>
      useCheckoutBalanceGate(50_000_000n),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.balanceRaw).toBe(100_000_000n);
    expect(result.current.requiredRaw).toBe(50_000_000n);
    expect(result.current.hasInsufficient).toBe(false);
    expect(result.current.deficitRaw).toBe(0n);
  });

  it("insufficient — balance < required, deficit computed", () => {
    readContractMock.mockReturnValue({
      data: 10_000_000n,
      isPending: false,
    });

    const { result } = renderHook(() =>
      useCheckoutBalanceGate(50_000_000n),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.balanceRaw).toBe(10_000_000n);
    expect(result.current.hasInsufficient).toBe(true);
    expect(result.current.deficitRaw).toBe(40_000_000n);
  });

  it("exact match — balance == required is NOT insufficient (boundary)", () => {
    readContractMock.mockReturnValue({
      data: 50_000_000n,
      isPending: false,
    });

    const { result } = renderHook(() =>
      useCheckoutBalanceGate(50_000_000n),
    );

    expect(result.current.hasInsufficient).toBe(false);
    expect(result.current.deficitRaw).toBe(0n);
    expect(result.current.balanceRaw).toBe(50_000_000n);
  });

  it("no buyer — useAccount address undefined returns loading", () => {
    accountMock.mockReturnValue({ address: undefined });
    readContractMock.mockReturnValue({ data: undefined, isPending: false });

    const { result } = renderHook(() =>
      useCheckoutBalanceGate(50_000_000n),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasInsufficient).toBe(false);
  });
});

describe("useCheckoutBalanceGate — wagmi config propagation", () => {
  it("passes USDT address + balanceOf to useReadContract", () => {
    readContractMock.mockReturnValue({
      data: 100_000_000n,
      isPending: false,
    });

    renderHook(() => useCheckoutBalanceGate(50_000_000n));

    expect(readContractMock).toHaveBeenCalled();
    const args = readContractMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.address).toBe(USDT);
    expect(args.functionName).toBe("balanceOf");
    expect(args.args).toEqual([BUYER]);
  });

  it("propagates cache options : staleTime 0 + refetchOnWindowFocus + refetchOnReconnect", () => {
    readContractMock.mockReturnValue({
      data: 100_000_000n,
      isPending: false,
    });

    renderHook(() => useCheckoutBalanceGate(50_000_000n));

    const args = readContractMock.mock.calls[0][0] as {
      query: Record<string, unknown>;
    };
    expect(args.query.staleTime).toBe(0);
    expect(args.query.refetchOnWindowFocus).toBe(true);
    expect(args.query.refetchOnReconnect).toBe(true);
    expect(args.query.enabled).toBe(true);
  });

  it("disables read when buyer address absent (enabled=false)", () => {
    accountMock.mockReturnValue({ address: undefined });
    readContractMock.mockReturnValue({ data: undefined, isPending: false });

    renderHook(() => useCheckoutBalanceGate(50_000_000n));

    const args = readContractMock.mock.calls[0][0] as {
      query: Record<string, unknown>;
    };
    expect(args.query.enabled).toBe(false);
  });
});
