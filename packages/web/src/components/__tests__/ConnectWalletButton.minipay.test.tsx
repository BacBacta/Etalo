/**
 * Vitest specs guarding the MiniPay zero-click + no-address-display
 * contract on ConnectWalletButton (MiniPay readiness requirements §1 +
 * §3 ; CLAUDE.md rule #5 "never display raw 0x… addresses" + rule #7
 * "never show a Connect button inside MiniPay").
 *
 * The button MUST render nothing inside MiniPay context regardless of
 * the wagmi connection state — disconnected (handshake in flight) AND
 * connected (the wallet IS MiniPay, our app has no business showing a
 * truncated 0x… chip in the header).
 */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAccountMock = vi.hoisted(() =>
  vi.fn(
    (): { address: string | undefined; isConnected: boolean } => ({
      address: undefined,
      isConnected: false,
    }),
  ),
);
const useConnectMock = vi.hoisted(() =>
  vi.fn(() => ({
    connect: vi.fn(),
    connectors: [],
    isPending: false,
  })),
);
const useDisconnectMock = vi.hoisted(() =>
  vi.fn(() => ({ disconnect: vi.fn() })),
);

vi.mock("wagmi", () => ({
  useAccount: useAccountMock,
  useConnect: useConnectMock,
  useDisconnect: useDisconnectMock,
}));

vi.mock("@/components/ui/v4/Sheet", () => ({
  SheetV4: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetV4Content: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetV4Description: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  SheetV4Header: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetV4Title: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  SheetV4Trigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ConnectWalletButton } from "@/components/ConnectWalletButton";

function setEthereum(eth: unknown) {
  Object.defineProperty(window, "ethereum", {
    value: eth,
    writable: true,
    configurable: true,
  });
}

const SAMPLE_ADDRESS = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01" as const;

beforeEach(() => {
  useAccountMock.mockReturnValue({ address: undefined, isConnected: false });
  useConnectMock.mockReturnValue({
    connect: vi.fn(),
    connectors: [],
    isPending: false,
  });
  useDisconnectMock.mockReturnValue({ disconnect: vi.fn() });
});

afterEach(() => {
  Object.defineProperty(window, "ethereum", {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

describe("ConnectWalletButton — MiniPay zero-click contract", () => {
  it("renders NOTHING interactive in MiniPay context, disconnected", () => {
    setEthereum({ isMiniPay: true });
    useAccountMock.mockReturnValue({ address: undefined, isConnected: false });

    const { container } = render(<ConnectWalletButton />);

    // First paint = SSR-safe placeholder (aria-hidden div, no
    // children). Post-mount = lenient-detection branch returns null.
    // Either snapshot : ZERO interactive elements, ZERO Connect text.
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent ?? "").not.toMatch(/connect|MiniPay|0x/i);
  });

  it("renders NOTHING in MiniPay context, CONNECTED (no address chip)", () => {
    // Critical anti-regression : pre-fix the component rendered
    // ConnectedAddressMenu (truncated 0x… chip) here — direct
    // violation of the readiness requirements §3 "never display
    // raw 0x… addresses as primary identifier".
    setEthereum({ isMiniPay: true });
    useAccountMock.mockReturnValue({
      address: SAMPLE_ADDRESS,
      isConnected: true,
    });

    const { container } = render(<ConnectWalletButton />);

    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent ?? "").not.toContain("0xAbCdEf");
    expect((container.textContent ?? "").toLowerCase()).not.toContain("0xab");
  });

});
