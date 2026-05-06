/**
 * ConfirmDeliveryButton — J11.5 Block 4.D.
 *
 * The hook (`useConfirmDelivery`) is mocked at the module boundary
 * so we don't need to wire wagmi providers + a QueryClient. Asserts
 * the 4 CLAUDE.md rule-8 states render correctly + click triggers
 * run() with the right args.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmDeliveryButton } from "@/components/orders/ConfirmDeliveryButton";

const useConfirmDeliveryMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useConfirmDelivery", () => ({
  useConfirmDelivery: useConfirmDeliveryMock,
}));

afterEach(() => {
  useConfirmDeliveryMock.mockReset();
});

const ORDER_ID = 9001n;
const ITEM_ID = 9101n;

describe("ConfirmDeliveryButton", () => {
  it("idle : renders the primary button with run trigger", () => {
    const run = vi.fn();
    useConfirmDeliveryMock.mockReturnValue({
      state: { phase: "idle" },
      run,
      reset: vi.fn(),
    });

    render(
      <ConfirmDeliveryButton
        orderId={ORDER_ID}
        itemId={ITEM_ID}
        itemLabel="Item #1"
      />,
    );

    const btn = screen.getByTestId("confirm-delivery-button");
    expect(btn).toHaveTextContent("Confirm delivery for Item #1");
    fireEvent.click(btn);
    expect(run).toHaveBeenCalledWith({ orderId: ORDER_ID, itemId: ITEM_ID });
  });

  it("preparing : surfaces loading state", () => {
    useConfirmDeliveryMock.mockReturnValue({
      state: { phase: "preparing" },
      run: vi.fn(),
      reset: vi.fn(),
    });

    render(
      <ConfirmDeliveryButton
        orderId={ORDER_ID}
        itemId={ITEM_ID}
        itemLabel="Item #1"
      />,
    );

    const pending = screen.getByTestId("confirm-delivery-pending");
    expect(pending).toHaveAttribute("data-phase", "preparing");
    expect(pending).toHaveTextContent(/preparing/i);
  });

  it("confirming : surfaces on-chain state", () => {
    useConfirmDeliveryMock.mockReturnValue({
      state: { phase: "confirming", txHash: "0xabc" },
      run: vi.fn(),
      reset: vi.fn(),
    });

    render(
      <ConfirmDeliveryButton
        orderId={ORDER_ID}
        itemId={ITEM_ID}
        itemLabel="Item #1"
      />,
    );

    const pending = screen.getByTestId("confirm-delivery-pending");
    expect(pending).toHaveAttribute("data-phase", "confirming");
    expect(pending).toHaveTextContent(/confirming on-chain/i);
  });

  it("success : surfaces success message with item label", () => {
    useConfirmDeliveryMock.mockReturnValue({
      state: { phase: "success", txHash: "0xabc" },
      run: vi.fn(),
      reset: vi.fn(),
    });

    render(
      <ConfirmDeliveryButton
        orderId={ORDER_ID}
        itemId={ITEM_ID}
        itemLabel="Item #1"
      />,
    );

    expect(screen.getByTestId("confirm-delivery-success")).toHaveTextContent(
      /delivery confirmed for item #1/i,
    );
  });

  it("error : surfaces error + retry CTA that resets and runs again", () => {
    const run = vi.fn();
    const reset = vi.fn();
    useConfirmDeliveryMock.mockReturnValue({
      state: {
        phase: "error",
        error: { code: "user_rejected", message: "You cancelled the transaction." },
      },
      run,
      reset,
    });

    render(
      <ConfirmDeliveryButton
        orderId={ORDER_ID}
        itemId={ITEM_ID}
        itemLabel="Item #1"
      />,
    );

    expect(screen.getByTestId("confirm-delivery-error")).toBeInTheDocument();
    expect(screen.getByText(/you cancelled the transaction/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith({ orderId: ORDER_ID, itemId: ITEM_ID });
  });
});
