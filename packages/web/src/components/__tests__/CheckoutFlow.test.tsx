/**
 * Integration test for CheckoutFlow phase=idle balance-gate behaviour
 * (J11 #1 — Add Cash gate).
 *
 * Asserts the wiring : when useCheckoutBalanceGate reports insufficient
 * balance, CheckoutFlow renders InsufficientBalanceCTA INSTEAD of the
 * "Start checkout" button. This is the single most likely silent
 * regression vector if the hook gets accidentally removed during a
 * refactor.
 *
 * Mocks both hooks at the module boundary :
 *   - useSequentialCheckout → idle phase (no real tx flow)
 *   - useCheckoutBalanceGate → insufficient / sufficient / loading per case
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutFlow } from "@/components/CheckoutFlow";
import type { ResolvedCart } from "@/lib/checkout";

const sequentialCheckoutMock = vi.fn();
const balanceGateMock = vi.fn();

vi.mock("@/hooks/useSequentialCheckout", () => ({
  useSequentialCheckout: (...args: unknown[]) =>
    sequentialCheckoutMock(...args),
}));

vi.mock("@/hooks/useCheckoutBalanceGate", () => ({
  useCheckoutBalanceGate: (...args: unknown[]) => balanceGateMock(...args),
}));

vi.mock("wagmi", () => ({
  useChainId: () => 11142220,
}));

vi.mock("@/lib/cart-store", () => ({
  useCartStore: (selector: (state: unknown) => unknown) =>
    selector({
      clearCart: () => {},
      clearSellerItems: () => {},
    }),
}));

const idleState = {
  phase: "idle" as const,
  sellers: [
    {
      sellerHandle: "smoke_b2",
      sellerShopName: "Smoke Test Boutique",
      status: "pending" as const,
    },
  ],
  currentSellerIndex: -1,
};

const minimalCart: ResolvedCart = {
  groups: [
    {
      seller_handle: "smoke_b2",
      seller_shop_name: "Smoke Test Boutique",
      seller_address: "0xseller000000000000000000000000000000001",
      is_cross_border: false,
      subtotal_usdt: "10.00",
      items: [
        {
          product_id: "prod-1",
          slug: "smoke-product",
          title: "Smoke product",
          price_usdt: "10.00",
          qty: 1,
          image_url: null,
        },
      ],
    },
  ],
  total_usdt: "10.00",
} as unknown as ResolvedCart;

beforeEach(() => {
  sequentialCheckoutMock.mockReset();
  balanceGateMock.mockReset();
  sequentialCheckoutMock.mockReturnValue({
    state: idleState,
    start: vi.fn(),
    cancel: vi.fn(),
  });
});

describe("CheckoutFlow — phase=idle balance gate wiring", () => {
  it("renders InsufficientBalanceCTA when gate reports insufficient", () => {
    balanceGateMock.mockReturnValue({
      isLoading: false,
      balanceRaw: 5_000_000n,
      requiredRaw: 10_000_000n,
      hasInsufficient: true,
      deficitRaw: 5_000_000n,
    });

    render(<CheckoutFlow cart={minimalCart} token="test-token" />);

    expect(
      screen.getByTestId("insufficient-balance-cta"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You need 5\.00 USDT more to complete this order/),
    ).toBeInTheDocument();
    // "Start checkout" button MUST NOT be rendered.
    expect(
      screen.queryByRole("button", { name: /Start checkout/i }),
    ).not.toBeInTheDocument();
  });

  it("renders Start checkout button when gate reports sufficient balance", () => {
    balanceGateMock.mockReturnValue({
      isLoading: false,
      balanceRaw: 100_000_000n,
      requiredRaw: 10_000_000n,
      hasInsufficient: false,
      deficitRaw: 0n,
    });

    render(<CheckoutFlow cart={minimalCart} token="test-token" />);

    const startBtn = screen.getByRole("button", { name: /Start checkout/i });
    expect(startBtn).toBeInTheDocument();
    expect(startBtn).not.toBeDisabled();
    // CTA MUST NOT be rendered.
    expect(
      screen.queryByTestId("insufficient-balance-cta"),
    ).not.toBeInTheDocument();
  });

  it("renders Start checkout button as disabled while gate is loading", () => {
    balanceGateMock.mockReturnValue({
      isLoading: true,
      balanceRaw: undefined,
      requiredRaw: 10_000_000n,
      hasInsufficient: false,
      deficitRaw: 0n,
    });

    render(<CheckoutFlow cart={minimalCart} token="test-token" />);

    const startBtn = screen.getByRole("button", { name: /Start checkout/i });
    expect(startBtn).toBeInTheDocument();
    expect(startBtn).toBeDisabled();
    expect(
      screen.queryByTestId("insufficient-balance-cta"),
    ).not.toBeInTheDocument();
  });

  it("calls useCheckoutBalanceGate with the correct raw cart total (parseUnits 6 decimals)", () => {
    balanceGateMock.mockReturnValue({
      isLoading: false,
      balanceRaw: 100_000_000n,
      requiredRaw: 10_000_000n,
      hasInsufficient: false,
      deficitRaw: 0n,
    });

    render(<CheckoutFlow cart={minimalCart} token="test-token" />);

    expect(balanceGateMock).toHaveBeenCalled();
    // total_usdt = "10.00" → parseUnits with 6 decimals = 10_000_000n
    expect(balanceGateMock).toHaveBeenCalledWith(10_000_000n);
  });
});
