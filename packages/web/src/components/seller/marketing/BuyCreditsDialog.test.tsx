/**
 * Vitest specs for BuyCreditsDialog (J7 Block 7b).
 *
 * Mocks: wagmi (useChainId), useBuyCredits hook (so we drive phase
 * transitions deterministically without going near a real wallet).
 * Tests focus on the UI state machine — preset selection, custom-
 * amount validation, USDT cost computation, CTA gating during
 * tx-in-flight, success/error/cancel views.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BuyCreditsDialog } from "@/components/seller/marketing/BuyCreditsDialog";
import type { BuyCreditsState } from "@/hooks/useBuyCredits";

vi.mock("wagmi", () => ({
  useChainId: () => 11142220, // Celo Sepolia
}));

let hookState: BuyCreditsState = { phase: "idle" };
const startMock = vi.fn();
const cancelMock = vi.fn();
const resetMock = vi.fn();

vi.mock("@/hooks/useBuyCredits", () => ({
  useBuyCredits: () => ({
    state: hookState,
    start: startMock,
    cancel: cancelMock,
    reset: resetMock,
  }),
}));

beforeEach(() => {
  hookState = { phase: "idle" };
  startMock.mockReset();
  cancelMock.mockReset();
  resetMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderOpen(onSuccess?: () => void) {
  return render(
    <BuyCreditsDialog
      open={true}
      onOpenChange={() => {}}
      onSuccess={onSuccess}
    />,
  );
}

describe("BuyCreditsDialog — preset rendering and cost", () => {
  it("renders all 4 preset cards with correct USDT cost", () => {
    renderOpen();
    expect(screen.getByTestId("preset-10")).toHaveTextContent("1.5 USDT");
    expect(screen.getByTestId("preset-50")).toHaveTextContent("7.5 USDT");
    expect(screen.getByTestId("preset-100")).toHaveTextContent("15 USDT");
    expect(screen.getByTestId("preset-250")).toHaveTextContent("37.5 USDT");
  });

  it("defaults to the 10-credit preset and renders the CTA cost", () => {
    renderOpen();
    expect(screen.getByTestId("preset-10")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("buy-cta")).toHaveTextContent(
      "Buy 10 credits for 1.5 USDT",
    );
  });

  it("switches to a different preset when clicked", () => {
    renderOpen();
    fireEvent.click(screen.getByTestId("preset-100"));
    expect(screen.getByTestId("preset-100")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("buy-cta")).toHaveTextContent(
      "Buy 100 credits for 15 USDT",
    );
  });
});

describe("BuyCreditsDialog — custom amount validation", () => {
  it("uses the custom amount over the preset and updates cost", () => {
    renderOpen();
    fireEvent.change(screen.getByTestId("custom-amount-input"), {
      target: { value: "75" },
    });
    expect(screen.getByTestId("custom-amount-cost")).toHaveTextContent(
      "75 credits = 11.25 USDT",
    );
    expect(screen.getByTestId("buy-cta")).toHaveTextContent(
      "Buy 75 credits for 11.25 USDT",
    );
  });

  it("flags zero or negative as invalid and disables the CTA", () => {
    renderOpen();
    fireEvent.change(screen.getByTestId("custom-amount-input"), {
      target: { value: "0" },
    });
    expect(screen.getByTestId("custom-amount-error")).toBeInTheDocument();
    expect(screen.getByTestId("buy-cta")).toBeDisabled();
  });

  it("flags amounts above the 10000 ceiling as invalid", () => {
    renderOpen();
    fireEvent.change(screen.getByTestId("custom-amount-input"), {
      target: { value: "10001" },
    });
    expect(screen.getByTestId("custom-amount-error")).toBeInTheDocument();
    expect(screen.getByTestId("buy-cta")).toBeDisabled();
  });
});

describe("BuyCreditsDialog — tx-in-flight gating", () => {
  it("disables the CTA and shows the phase status while approving", () => {
    hookState = { phase: "approving" };
    renderOpen();
    expect(screen.getByTestId("buy-cta")).toBeDisabled();
    expect(screen.getByTestId("phase-status")).toHaveTextContent(
      "Approving USDT",
    );
    expect(screen.getByTestId("cancel-btn")).toBeDisabled();
  });

  it("renders tx hash links once approveTxHash is set", () => {
    hookState = {
      phase: "awaitingApproveReceipt",
      approveTxHash: "0xabcdef0123456789abcdef0123456789abcdef0123456789",
    };
    renderOpen();
    const status = screen.getByTestId("phase-status");
    expect(status).toHaveTextContent("Waiting for approve");
    expect(status.textContent).toContain("0xabcdef");
  });
});

describe("BuyCreditsDialog — success and error views", () => {
  it("renders the success view with credits + tx hash and fires onSuccess on Done", () => {
    hookState = {
      phase: "success",
      purchasedCredits: 10n,
      usdtSpent: 1_500_000n,
      purchaseTxHash:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    };
    const onSuccess = vi.fn();
    renderOpen(onSuccess);
    expect(screen.getByTestId("success-view")).toBeInTheDocument();
    expect(screen.getByTestId("success-view")).toHaveTextContent(
      "+10 credits",
    );
    fireEvent.click(screen.getByTestId("success-done-btn"));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("renders the error view with the message and a retry button", () => {
    hookState = {
      phase: "error",
      errorMessage: "Approve transaction reverted.",
    };
    renderOpen();
    expect(screen.getByTestId("error-view")).toBeInTheDocument();
    expect(screen.getByTestId("error-message")).toHaveTextContent(
      "Approve transaction reverted.",
    );
    fireEvent.click(screen.getByTestId("error-retry-btn"));
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("shows a canceled hint when the user rejected in the wallet", () => {
    hookState = { phase: "canceled" };
    renderOpen();
    expect(screen.getByTestId("canceled-hint")).toBeInTheDocument();
    // CTA still active — user can re-attempt.
    expect(screen.getByTestId("buy-cta")).not.toBeDisabled();
  });
});

describe("BuyCreditsDialog — start invocation", () => {
  it("calls start with the chosen preset (as bigint) when CTA is clicked", () => {
    renderOpen();
    fireEvent.click(screen.getByTestId("preset-50"));
    fireEvent.click(screen.getByTestId("buy-cta"));
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledWith(50n);
  });

  it("calls start with the custom amount when the input is filled", () => {
    renderOpen();
    fireEvent.change(screen.getByTestId("custom-amount-input"), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getByTestId("buy-cta"));
    expect(startMock).toHaveBeenCalledWith(123n);
  });
});
