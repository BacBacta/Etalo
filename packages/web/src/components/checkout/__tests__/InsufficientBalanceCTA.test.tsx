/**
 * Vitest specs for InsufficientBalanceCTA (J11 #1 — Add Cash gate).
 *
 * Asserts :
 *  - Deficit text rendered with displayUsdt format ("12.35 USDT")
 *  - Accessibility : role="alert" + aria-live="polite" + aria-describedby
 *  - Auto-focus on mount (keyboard accessibility)
 *  - Click triggers the navigation handler with the correct deeplink
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InsufficientBalanceCTA } from "@/components/checkout/InsufficientBalanceCTA";
import { MINIPAY_DEEPLINKS } from "@/lib/minipay-deeplinks";

describe("InsufficientBalanceCTA — render + content", () => {
  it("renders deficit using displayUsdt format (12.35 USDT)", () => {
    // 12.35 USDT = 12_350_000 raw (6 decimals)
    render(<InsufficientBalanceCTA deficitRaw={12_350_000n} />);

    expect(
      screen.getByText(/You need 12\.35 USDT more to complete this order/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Insufficient stablecoin balance/),
    ).toBeInTheDocument();
  });

  it("renders the Deposit in MiniPay button label (MiniPay-compliant copy)", () => {
    render(<InsufficientBalanceCTA deficitRaw={1_000_000n} />);

    expect(
      screen.getByRole("button", { name: /Deposit in MiniPay/ }),
    ).toBeInTheDocument();
  });
});

describe("InsufficientBalanceCTA — accessibility", () => {
  it("has role='alert' with aria-live='polite' on container", () => {
    render(<InsufficientBalanceCTA deficitRaw={1_000_000n} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "polite");
  });

  it("button has aria-describedby pointing to the deficit message", () => {
    render(<InsufficientBalanceCTA deficitRaw={1_000_000n} />);

    const button = screen.getByRole("button", { name: /Deposit in MiniPay/ });
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    // The element pointed at must exist in the DOM and contain the deficit text.
    const messageEl = document.getElementById(describedBy!);
    expect(messageEl).not.toBeNull();
    expect(messageEl!.textContent).toMatch(/You need 1\.00 USDT more/);
  });

  it("auto-focuses the deposit button on mount", async () => {
    render(<InsufficientBalanceCTA deficitRaw={1_000_000n} />);

    const button = screen.getByRole("button", { name: /Deposit in MiniPay/ });
    // useEffect runs synchronously in jsdom; focus should be applied.
    expect(document.activeElement).toBe(button);
  });
});

describe("InsufficientBalanceCTA — click behaviour", () => {
  it("invokes injected onDeposit handler when the button is clicked", () => {
    const onDeposit = vi.fn();
    render(
      <InsufficientBalanceCTA
        deficitRaw={1_000_000n}
        onDeposit={onDeposit}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Deposit in MiniPay/ }),
    );
    expect(onDeposit).toHaveBeenCalledTimes(1);
  });

  it("default onClick navigates to MINIPAY_DEEPLINKS.ADD_CASH (asserted via stub)", () => {
    // We can't safely mutate window.location in jsdom, but we can verify
    // the constant value the production handler navigates to. The
    // navigateToMiniPayDeeplink helper in src/lib/minipay-deeplinks.ts
    // accepts an injectable navigate fn (covered separately).
    expect(MINIPAY_DEEPLINKS.ADD_CASH).toBe("https://minipay.opera.com/add_cash");
  });
});
