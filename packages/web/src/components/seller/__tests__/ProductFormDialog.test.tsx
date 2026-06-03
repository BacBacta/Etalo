/**
 * Vitest specs for ProductFormDialog.
 *
 * - FormField helper : label↔input association (Phase 5 Angle E).
 * - ADR-049 publish-time enhancement enforcement : a buyer-visible
 *   (active) product with a raw hero photo is gated behind a one-step
 *   confirmation ; draft products are not gated.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormField, ProductFormDialog } from "@/components/seller/ProductFormDialog";

// ImageUploader → a button that injects a hero hash via onChange, so the
// spec can simulate "seller uploaded a photo" without real IPFS.
vi.mock("@/components/seller/ImageUploader", () => ({
  ImageUploader: ({ onChange }: { onChange: (h: string[]) => void }) => (
    <button
      type="button"
      data-testid="mock-upload"
      onClick={() => onChange(["QmHeroPhoto123"])}
    >
      upload
    </button>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const createProductMock = vi.fn().mockResolvedValue({ id: "p1" });
vi.mock("@/lib/seller-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/seller-api")>();
  return {
    ...actual,
    createProduct: (...args: unknown[]) => createProductMock(...args),
  };
});

// Credits hook — controllable per-test so we can assert the balance
// display + the buy-credits CTA gating without a QueryClient/Wagmi tree.
const creditsBalanceMock = vi.fn(() => ({ data: { balance: 3 }, isLoading: false }));
vi.mock("@/hooks/useCreditsBalance", () => ({
  useCreditsBalance: () => creditsBalanceMock(),
  CREDITS_BALANCE_QUERY_KEY: "credits-balance",
}));

// BuyCreditsDialog (on-chain wagmi) → stub to a marker so we can assert
// it mounts without pulling the WagmiProvider into the spec.
vi.mock("@/components/seller/marketing/BuyCreditsDialog", () => ({
  BuyCreditsDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="buy-credits-dialog" /> : null,
}));

// useQueryClient is the only @tanstack/react-query symbol the dialog
// needs at runtime here — stub it, keep everything else real.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

describe("ProductFormDialog — FormField label↔input association (Phase 5 Angle E sub-block E.1.b)", () => {
  it("associates the label with the child input via htmlFor + id (getByLabelText resolves)", () => {
    render(
      <FormField label="Title">
        <input type="text" defaultValue="" />
      </FormField>,
    );
    const input = screen.getByLabelText("Title");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("renders the hint text below the input when no error is set", () => {
    render(
      <FormField label="Description" hint="Tip: include size info">
        <textarea defaultValue="" />
      </FormField>,
    );
    expect(screen.getByText("Tip: include size info")).toBeInTheDocument();
  });
});

describe("ProductFormDialog — ADR-049 publish enhancement enforcement", () => {
  beforeEach(() => {
    createProductMock.mockClear();
    creditsBalanceMock.mockReturnValue({
      data: { balance: 3 },
      isLoading: false,
    });
  });

  function renderCreate() {
    render(
      <ProductFormDialog
        open
        onOpenChange={vi.fn()}
        walletAddress="0xabc"
        mode="create"
        onSuccess={vi.fn()}
      />,
    );
  }

  function fillRequiredFields() {
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Wax dress" },
    });
    fireEvent.change(screen.getByLabelText("Price (USDT)"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Stock"), {
      target: { value: "5" },
    });
  }

  it("gates an active product with a raw hero photo behind a confirmation", async () => {
    renderCreate();
    fireEvent.click(screen.getByTestId("mock-upload")); // upload hero
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Product status"), {
      target: { value: "active" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    // Nudge shows ; the product is NOT created yet.
    expect(screen.getByTestId("publish-enhance-nudge")).toBeInTheDocument();
    expect(createProductMock).not.toHaveBeenCalled();

    // "Publish anyway" proceeds with the create.
    fireEvent.click(screen.getByTestId("publish-nudge-anyway"));
    await waitFor(() => expect(createProductMock).toHaveBeenCalledTimes(1));
  });

  it("does NOT gate a draft product (not buyer-visible)", async () => {
    renderCreate();
    fireEvent.click(screen.getByTestId("mock-upload"));
    fillRequiredFields();
    // status stays "draft" (default)

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(screen.queryByTestId("publish-enhance-nudge")).not.toBeInTheDocument();
    await waitFor(() => expect(createProductMock).toHaveBeenCalledTimes(1));
  });
});

describe("ProductFormDialog — ADR-049 credits visibility + purchase", () => {
  function renderCreate() {
    render(
      <ProductFormDialog
        open
        onOpenChange={vi.fn()}
        walletAddress="0xabc"
        mode="create"
        onSuccess={vi.fn()}
      />,
    );
  }

  it("shows the credit balance once a hero photo is uploaded", () => {
    creditsBalanceMock.mockReturnValue({
      data: { balance: 2 },
      isLoading: false,
    });
    renderCreate();
    fireEvent.click(screen.getByTestId("mock-upload"));
    expect(screen.getByTestId("enhance-credit-balance")).toHaveTextContent(
      "2 credits available",
    );
    // Credits available → the enhance CTA is shown, not the buy CTA.
    expect(screen.getByTestId("enhance-cta")).toBeInTheDocument();
    expect(screen.queryByTestId("enhance-buy-credits")).not.toBeInTheDocument();
  });

  it("swaps the CTA to Buy credits + opens the purchase dialog at 0 balance", () => {
    creditsBalanceMock.mockReturnValue({
      data: { balance: 0 },
      isLoading: false,
    });
    renderCreate();
    fireEvent.click(screen.getByTestId("mock-upload"));
    expect(screen.getByTestId("enhance-credit-balance")).toHaveTextContent(
      "0 credits available",
    );
    const buyCta = screen.getByTestId("enhance-buy-credits");
    expect(buyCta).toBeInTheDocument();
    expect(screen.queryByTestId("enhance-cta")).not.toBeInTheDocument();

    fireEvent.click(buyCta);
    expect(screen.getByTestId("buy-credits-dialog")).toBeInTheDocument();
  });
});
