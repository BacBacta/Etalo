/**
 * Vitest specs guarding the MiniPay auto-connect failure-recovery
 * contract (2026-05-23 production bug : dashboard skeleton stuck
 * forever when wagmi connect rejects, no Retry surface).
 *
 * The bug : the watchdog useEffect deps included `isConnecting`,
 * so when wagmi went pending → error, the deps changed and the
 * cleanup ran BEFORE the 8 s timeout, leaving the user stuck with
 * connectFailed=false (no Retry surface) and !isConnected (Skeleton
 * forever).
 *
 * The fix : the watchdog arms on mount and only clears on
 * `isConnected=true` / unmount. A separate effect listens for
 * `status === "error"` to surface Retry immediately.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockStatus = "idle" | "pending" | "success" | "error";

const useAccountMock = vi.hoisted(() =>
  vi.fn(
    (): { address: string | undefined; isConnected: boolean } => ({
      address: undefined,
      isConnected: false,
    }),
  ),
);
const useConnectMock = vi.hoisted(() =>
  vi.fn(
    (): {
      connect: ReturnType<typeof vi.fn>;
      connectors: Array<{ id: string; type: string; name: string }>;
      status: MockStatus;
    } => ({
      connect: vi.fn(),
      connectors: [],
      status: "idle",
    }),
  ),
);

vi.mock("wagmi", () => ({
  useAccount: useAccountMock,
  useConnect: useConnectMock,
}));

function setEthereum(eth: unknown) {
  Object.defineProperty(window, "ethereum", {
    value: eth,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  setEthereum({ isMiniPay: true });
  useAccountMock.mockReturnValue({ address: undefined, isConnected: false });
  useConnectMock.mockReturnValue({
    connect: vi.fn(),
    connectors: [
      { id: "minipay", type: "injected", name: "MiniPay" },
      { id: "injected", type: "injected", name: "Injected" },
    ],
    status: "idle",
  });
});

afterEach(() => {
  Object.defineProperty(window, "ethereum", {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

describe("useMinipay — failure-recovery contract", () => {
  it("fires connect() on mount when in MiniPay and disconnected", async () => {
    const connectFn = vi.fn();
    useConnectMock.mockReturnValue({
      connect: connectFn,
      connectors: [
        { id: "minipay", type: "injected", name: "MiniPay" },
        { id: "injected", type: "injected", name: "Injected" },
      ],
      status: "idle",
    });

    const { useMinipay } = await import("@/hooks/useMinipay");
    renderHook(() => useMinipay());

    expect(connectFn).toHaveBeenCalledTimes(1);
    expect(connectFn.mock.calls[0][0]).toEqual({
      connector: expect.objectContaining({ id: "minipay" }),
    });
  });

  it("flips connectFailed=true when wagmi status goes error (NO timeout wait)", async () => {
    // Critical anti-regression : the previous watchdog cleared its
    // timeout when isConnecting flipped false (deps change on error),
    // so connectFailed stayed false. User was stuck on dashboard
    // skeleton with no Retry surface forever.
    useConnectMock.mockReturnValue({
      connect: vi.fn(),
      connectors: [
        { id: "minipay", type: "injected", name: "MiniPay" },
        { id: "injected", type: "injected", name: "Injected" },
      ],
      status: "error",
    });

    const { useMinipay } = await import("@/hooks/useMinipay");
    const { result } = renderHook(() => useMinipay());

    expect(result.current.connectFailed).toBe(true);
  });
});
