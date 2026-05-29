/**
 * Vitest specs for CheckoutProgressStepper.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CheckoutProgressStepper } from "@/components/checkout/CheckoutProgressStepper";
import type { SellerExecution } from "@/hooks/useSequentialCheckout";

function seller(
  handle: string,
  status: SellerExecution["status"],
): SellerExecution {
  return {
    sellerHandle: handle,
    sellerShopName: handle,
    status,
  };
}

describe("CheckoutProgressStepper", () => {
  it("marks the approve step current during the allowance phase", () => {
    render(
      <CheckoutProgressStepper
        phase="allowance"
        sellers={[seller("a", "pending")]}
      />,
    );
    expect(
      screen.getByTestId("checkout-step-approve").getAttribute("data-state"),
    ).toBe("current");
    expect(
      screen.getByTestId("checkout-step-pay").getAttribute("data-state"),
    ).toBe("pending");
  });

  it("marks the approve step done when approveSkipped=true", () => {
    render(
      <CheckoutProgressStepper
        phase="executing"
        sellers={[seller("a", "creating")]}
        approveSkipped
      />,
    );
    expect(
      screen.getByTestId("checkout-step-approve").getAttribute("data-state"),
    ).toBe("done");
    expect(
      screen.getByTestId("checkout-step-pay").getAttribute("data-state"),
    ).toBe("current");
  });

  it("renders 'k of N' on the pay step when there are multiple sellers", () => {
    render(
      <CheckoutProgressStepper
        phase="executing"
        sellers={[
          seller("a", "success"),
          seller("b", "creating"),
          seller("c", "pending"),
        ]}
        approveSkipped
      />,
    );
    expect(screen.getByText("1 of 3")).toBeDefined();
  });

  it("transitions all steps to done in the success phase", () => {
    render(
      <CheckoutProgressStepper
        phase="success"
        sellers={[seller("a", "success")]}
      />,
    );
    for (const key of ["approve", "pay", "done"] as const) {
      expect(
        screen.getByTestId(`checkout-step-${key}`).getAttribute("data-state"),
      ).toBe("done");
    }
  });
});
