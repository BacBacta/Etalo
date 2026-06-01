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
