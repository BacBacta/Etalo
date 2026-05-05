/**
 * Vitest specs for useBuyCredits (J7 Block 7b).
 *
 * Tests the hook's state machine end-to-end, mocking the wagmi
 * publicClient + walletClient and the EtaloCredits ABI's
 * CreditsPurchased event decoding.
 */
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBuyCredits } from "@/hooks/useBuyCredits";

const BUYER = "0xabc0000000000000000000000000000000000001" as const;
const USDT = "0xea07db5d3D7576864ac434133abFE0E815735300" as const;
const CREDITS_ADDR =
  "0x778a6bda524F4D396F9566c0dF131F76b0E15CA3" as const;

// Bypass the inFlightRef double-submit guard inside a single
// renderHook instance so consecutive `start()` calls in this file's
// specs each go through the full state machine.
vi.stubEnv("NEXT_PUBLIC_USDT_ADDRESS", USDT);
vi.stubEnv("NEXT_PUBLIC_CREDITS_ADDRESS", CREDITS_ADDR);

const readContractMock = vi.fn();
const writeContractMock = vi.fn();
const waitForReceiptMock = vi.fn();

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: BUYER }),
  useWalletClient: () => ({
    data: {
      writeContract: (args: unknown) => writeContractMock(args),
    },
  }),
  usePublicClient: () => ({
    readContract: (args: unknown) => readContractMock(args),
    waitForTransactionReceipt: (args: unknown) => waitForReceiptMock(args),
  }),
}));

// CreditsPurchased event decoding — return a synthetic args tuple so
// the success branch finishes without depending on viem's decodeEventLog
// matching a real ABI/topics combo.
vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    decodeEventLog: vi.fn(() => ({
      eventName: "CreditsPurchased",
      args: {
        creditAmount: 10n,
        usdtAmount: 1_500_000n,
        timestamp: 1_777_000_000n,
      },
    })),
  };
});

const PURCHASE_TX = "0xddd";
const APPROVE_TX = "0xaaa";
const RECEIPT_SUCCESS = {
  status: "success" as const,
  logs: [
    {
      data: "0x",
      topics: [],
    },
  ],
};

beforeEach(() => {
  readContractMock.mockReset();
  writeContractMock.mockReset();
  waitForReceiptMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useBuyCredits — happy paths", () => {
  it("transitions through approve+purchase when allowance is short", async () => {
    readContractMock.mockResolvedValue(0n); // allowance = 0
    writeContractMock
      .mockResolvedValueOnce(APPROVE_TX) // approve
      .mockResolvedValueOnce(PURCHASE_TX); // purchase
    waitForReceiptMock
      .mockResolvedValueOnce(RECEIPT_SUCCESS) // approve receipt
      .mockResolvedValueOnce(RECEIPT_SUCCESS); // purchase receipt

    const { result } = renderHook(() => useBuyCredits());
    await act(async () => {
      await result.current.start(10n);
    });

    expect(result.current.state.phase).toBe("success");
    expect(result.current.state.approveTxHash).toBe(APPROVE_TX);
    expect(result.current.state.purchaseTxHash).toBe(PURCHASE_TX);
    expect(result.current.state.purchasedCredits).toBe(10n);
    expect(result.current.state.usdtSpent).toBe(1_500_000n);
    // Two writeContract calls: approve + purchase
    expect(writeContractMock).toHaveBeenCalledTimes(2);
  });

  it("skips the approve tx when allowance is already sufficient", async () => {
    readContractMock.mockResolvedValue(10_000_000_000n); // 10k USDT
    writeContractMock.mockResolvedValueOnce(PURCHASE_TX);
    waitForReceiptMock.mockResolvedValueOnce(RECEIPT_SUCCESS);

    const { result } = renderHook(() => useBuyCredits());
    await act(async () => {
      await result.current.start(10n);
    });

    expect(result.current.state.phase).toBe("success");
    expect(result.current.state.approveTxHash).toBeUndefined();
    expect(result.current.state.purchaseTxHash).toBe(PURCHASE_TX);
    expect(writeContractMock).toHaveBeenCalledTimes(1); // purchase only
  });
});

describe("useBuyCredits — failure paths", () => {
  it("classifies user rejection as `canceled`, not error", async () => {
    readContractMock.mockResolvedValue(0n);
    // Simulate MetaMask reject — error.name UserRejectedRequestError
    // is what classifyError keys on.
    writeContractMock.mockRejectedValueOnce({
      name: "UserRejectedRequestError",
      message: "User rejected the request.",
    });

    const { result } = renderHook(() => useBuyCredits());
    await act(async () => {
      await result.current.start(10n);
    });

    expect(result.current.state.phase).toBe("canceled");
    expect(result.current.state.errorMessage).toBeUndefined();
  });

  it("surfaces a real revert as `error` with the classified message", async () => {
    readContractMock.mockResolvedValue(10_000_000_000n);
    writeContractMock.mockResolvedValueOnce(PURCHASE_TX);
    waitForReceiptMock.mockResolvedValueOnce({
      status: "reverted" as const,
      logs: [],
    });

    const { result } = renderHook(() => useBuyCredits());
    await act(async () => {
      await result.current.start(10n);
    });

    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.errorMessage).toContain("Transaction failed");
  });
});

describe("useBuyCredits — input validation", () => {
  it("rejects creditAmount === 0n with an error", async () => {
    const { result } = renderHook(() => useBuyCredits());
    await act(async () => {
      await result.current.start(0n);
    });
    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.errorMessage).toContain("at least 1");
    expect(writeContractMock).not.toHaveBeenCalled();
  });
});
