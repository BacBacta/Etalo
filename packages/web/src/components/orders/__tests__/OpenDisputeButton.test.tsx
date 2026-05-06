/**
 * OpenDisputeButton — J11.5 Block 4.D.
 *
 * Hook mocked at module boundary. Tests cover dialog open + reason
 * input + submit gating + state machine transitions.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenDisputeButton } from "@/components/orders/OpenDisputeButton";

const useOpenDisputeMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useOpenDispute", () => ({
  useOpenDispute: useOpenDisputeMock,
}));

afterEach(() => {
  useOpenDisputeMock.mockReset();
});

const ORDER_ID = 9001n;
const ITEM_ID = 9101n;

describe("OpenDisputeButton", () => {
  it("idle : trigger opens the dialog with reason input", () => {
    useOpenDisputeMock.mockReturnValue({
      state: { phase: "idle" },
      run: vi.fn(),
      reset: vi.fn(),
    });

    render(
      <OpenDisputeButton orderId={ORDER_ID} itemId={ITEM_ID} itemLabel="Item #1" />,
    );

    fireEvent.click(screen.getByTestId("open-dispute-trigger"));
    expect(screen.getByTestId("open-dispute-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("dispute-reason-input")).toBeInTheDocument();
  });

  it("submit gated when reason is empty", () => {
    useOpenDisputeMock.mockReturnValue({
      state: { phase: "idle" },
      run: vi.fn(),
      reset: vi.fn(),
    });

    render(
      <OpenDisputeButton orderId={ORDER_ID} itemId={ITEM_ID} itemLabel="Item #1" />,
    );

    fireEvent.click(screen.getByTestId("open-dispute-trigger"));
    expect(screen.getByTestId("open-dispute-submit")).toBeDisabled();
  });

  it("submit calls run() with trimmed reason", () => {
    const run = vi.fn();
    useOpenDisputeMock.mockReturnValue({
      state: { phase: "idle" },
      run,
      reset: vi.fn(),
    });

    render(
      <OpenDisputeButton orderId={ORDER_ID} itemId={ITEM_ID} itemLabel="Item #1" />,
    );

    fireEvent.click(screen.getByTestId("open-dispute-trigger"));
    const input = screen.getByTestId("dispute-reason-input");
    fireEvent.change(input, { target: { value: "  Item damaged in transit  " } });
    fireEvent.click(screen.getByTestId("open-dispute-submit"));

    expect(run).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      itemId: ITEM_ID,
      reason: "Item damaged in transit",
    });
  });

  it("confirming : surfaces on-chain pending state inside the dialog", () => {
    useOpenDisputeMock.mockReturnValue({
      state: { phase: "confirming", txHash: "0xabc" },
      run: vi.fn(),
      reset: vi.fn(),
    });

    render(
      <OpenDisputeButton orderId={ORDER_ID} itemId={ITEM_ID} itemLabel="Item #1" />,
    );

    fireEvent.click(screen.getByTestId("open-dispute-trigger"));
    const pending = screen.getByTestId("open-dispute-pending");
    expect(pending).toHaveAttribute("data-phase", "confirming");
  });

  it("success : surfaces confirmation + Close action", () => {
    useOpenDisputeMock.mockReturnValue({
      state: { phase: "success", txHash: "0xabc" },
      run: vi.fn(),
      reset: vi.fn(),
    });

    render(
      <OpenDisputeButton orderId={ORDER_ID} itemId={ITEM_ID} itemLabel="Item #1" />,
    );

    fireEvent.click(screen.getByTestId("open-dispute-trigger"));
    expect(screen.getByTestId("open-dispute-success")).toHaveTextContent(
      /dispute opened/i,
    );
  });

  it("error : surfaces error message inside the dialog", () => {
    useOpenDisputeMock.mockReturnValue({
      state: {
        phase: "error",
        error: { code: "contract_revert", message: "Order not funded" },
      },
      run: vi.fn(),
      reset: vi.fn(),
    });

    render(
      <OpenDisputeButton orderId={ORDER_ID} itemId={ITEM_ID} itemLabel="Item #1" />,
    );

    fireEvent.click(screen.getByTestId("open-dispute-trigger"));
    expect(screen.getByTestId("open-dispute-error")).toHaveTextContent(
      /order not funded/i,
    );
  });
});
