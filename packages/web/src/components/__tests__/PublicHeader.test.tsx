/**
 * Vitest specs for PublicHeader — J10-V5 Phase 4 Block 4c.
 *
 * Regression-guard: the "Switch mode" button is gone (vestigial post
 * Block 4b's drop of `etalo-mode-preference` auto-redirect; mode
 * selection now lives on HomeMiniPay's two primary CTAs).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublicHeader } from "@/components/PublicHeader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

// CartDrawer / CartTrigger are heavy via wagmi/cart-store — stub to
// keep the spec scoped to PublicHeader's own structure.
vi.mock("@/components/CartDrawer", () => ({
  CartDrawer: () => null,
}));
vi.mock("@/components/CartTrigger", () => ({
  CartTrigger: () => <button type="button" data-testid="cart-trigger" />,
}));

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
