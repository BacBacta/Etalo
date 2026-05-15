/**
 * Vitest specs for PublicHeader — J10-V5 Phase 4 Block 4c +
 * J11.5 Block 5 ("My orders" nav entry).
 *
 * Regression-guard: the "Switch mode" button is gone (vestigial post
 * Block 4b's drop of `etalo-mode-preference` auto-redirect; mode
 * selection now lives on HomeMiniPay's two primary CTAs).
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicHeader } from "@/components/PublicHeader";

const usePathnameMock = vi.hoisted(() => vi.fn(() => "/"));
const useAccountMock = vi.hoisted(() =>
  vi.fn(() => ({ isConnected: false })),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: usePathnameMock,
}));

vi.mock("wagmi", () => ({
  useAccount: useAccountMock,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

// CartDrawer / CartTrigger / ConnectWalletButton are heavy via
// wagmi/cart-store — stub to keep the spec scoped to PublicHeader's
// own structure.
vi.mock("@/components/CartDrawer", () => ({
  CartDrawer: () => null,
}));
vi.mock("@/components/CartTrigger", () => ({
  CartTrigger: () => <button type="button" data-testid="cart-trigger" />,
}));
vi.mock("@/components/ConnectWalletButton", () => ({
  ConnectWalletButton: () => (
    <button type="button" data-testid="connect-wallet-stub" />
  ),
}));

afterEach(() => {
  usePathnameMock.mockReturnValue("/");
  useAccountMock.mockReturnValue({ isConnected: false });
});

describe("PublicHeader — Switch mode removal (Block 4c)", () => {
  it("does NOT render a 'Switch mode' button (vestigial cleanup)", () => {
    render(<PublicHeader />);
    expect(
      screen.queryByRole("button", { name: /Switch mode/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the brand logo Link to / (home navigation kept)", () => {
    render(<PublicHeader />);
    const link = screen.getByRole("link", { name: /Etalo home/i });
    expect(link).toHaveAttribute("href", "/");
  });
});

describe("PublicHeader — My orders entry (J11.5 Block 5)", () => {
  it("does NOT render the My orders link when wallet is disconnected", () => {
    useAccountMock.mockReturnValue({ isConnected: false });
    render(<PublicHeader />);
    expect(screen.queryByTestId("nav-my-orders")).not.toBeInTheDocument();
  });

  it("renders the My orders link when wallet is connected", () => {
    useAccountMock.mockReturnValue({ isConnected: true });
    render(<PublicHeader />);
    const link = screen.getByTestId("nav-my-orders");
    expect(link).toHaveAttribute("href", "/orders");
    expect(link).toHaveAttribute("aria-label", "My orders");
  });

  it("highlights active when on /orders", () => {
    useAccountMock.mockReturnValue({ isConnected: true });
    usePathnameMock.mockReturnValue("/orders");
    render(<PublicHeader />);
    const link = screen.getByTestId("nav-my-orders");
    expect(link).toHaveAttribute("data-active", "true");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("highlights active when on /orders/[id]", () => {
    useAccountMock.mockReturnValue({ isConnected: true });
    usePathnameMock.mockReturnValue("/orders/abc-123");
    render(<PublicHeader />);
    const link = screen.getByTestId("nav-my-orders");
    expect(link).toHaveAttribute("data-active", "true");
  });

  it("does NOT highlight active on unrelated routes", () => {
    useAccountMock.mockReturnValue({ isConnected: true });
    usePathnameMock.mockReturnValue("/marketplace");
    render(<PublicHeader />);
    const link = screen.getByTestId("nav-my-orders");
    expect(link).toHaveAttribute("data-active", "false");
    expect(link).not.toHaveAttribute("aria-current");
  });
});
