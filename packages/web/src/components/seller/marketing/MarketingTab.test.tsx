/**
 * Vitest specs for MarketingTab (J7 Block 7a).
 *
 * Mocks: useAccount (wagmi), useCreditsBalance hook, marketing-api +
 * seller-api fetch helpers. We don't render the parent `<Tabs>` shell —
 * MarketingTab is a self-contained subtree.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketingTab } from "@/components/seller/MarketingTab";

// ── Mocks ──────────────────────────────────────────────────────────
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xabc0000000000000000000000000000000000001" }),
}));

const refetchBalanceMock = vi.fn();
const useCreditsBalanceMock = vi.fn(() => ({
  balance: 15,
  walletAddress: "0xabc0000000000000000000000000000000000001",
  loading: false,
  error: null,
  refetch: refetchBalanceMock,
}));

vi.mock("@/hooks/useCreditsBalance", () => ({
  useCreditsBalance: () => useCreditsBalanceMock(),
}));

const fetchMyProductsMock = vi.fn();
vi.mock("@/lib/seller-api", () => ({
  fetchMyProducts: (...args: unknown[]) => fetchMyProductsMock(...args),
}));

const generateImageMock = vi.fn();
vi.mock("@/lib/marketing-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/marketing-api")>(
      "@/lib/marketing-api",
    );
  return {
    ...actual,
    generateImage: (...args: unknown[]) => generateImageMock(...args),
    generateCaption: vi.fn(),
    fetchCreditsBalance: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// next/image needs HTMLElement compatibility — stub to a plain <img/>.
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    sizes?: string;
    className?: string;
  }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />,
}));

const SAMPLE_PRODUCT = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Red Dress",
  slug: "red-dress",
  description: null,
  price_usdt: "30.00",
  stock: 5,
  status: "active",
  category: null,
  metadata_ipfs_hash: null,
  image_ipfs_hashes: null,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
};

beforeEach(() => {
  fetchMyProductsMock.mockResolvedValue({
    products: [SAMPLE_PRODUCT],
    total: 1,
  });
  generateImageMock.mockReset();
  refetchBalanceMock.mockReset();
  useCreditsBalanceMock.mockReset();
  useCreditsBalanceMock.mockReturnValue({
    balance: 15,
    walletAddress: "0xabc0000000000000000000000000000000000001",
    loading: false,
    error: null,
    refetch: refetchBalanceMock,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("MarketingTab — credits balance display", () => {
  it("renders the credits balance from the hook", async () => {
    render(<MarketingTab />);
    expect(await screen.findByTestId("credits-amount")).toHaveTextContent(
      "15 credits",
    );
    expect(screen.queryByTestId("low-balance-warning")).not.toBeInTheDocument();
  });

  it("renders a low-balance warning when balance < 5", async () => {
    useCreditsBalanceMock.mockReturnValue({
      balance: 2,
      walletAddress: "0xabc",
      loading: false,
      error: null,
      refetch: refetchBalanceMock,
    });
    render(<MarketingTab />);
    expect(await screen.findByTestId("low-balance-warning")).toBeInTheDocument();
  });
});

describe("MarketingTab — generate button gating", () => {
  it("disables the generate button when no product is selected", async () => {
    render(<MarketingTab />);
    // Wait for product picker to load (otherwise the picker itself can be
    // gating the button via `selectedProduct === null`).
    await screen.findByTestId("product-picker-select");
    const btn = screen.getByTestId("generate-btn");
    expect(btn).toBeDisabled();
  });

  it("disables the generate button when no template is selected", async () => {
    render(<MarketingTab />);
    const select = await screen.findByTestId("product-picker-select");
    fireEvent.change(select, { target: { value: SAMPLE_PRODUCT.id } });
    // Product is now selected, but no template → still disabled.
    expect(screen.getByTestId("generate-btn")).toBeDisabled();
  });

  it("disables the generate button when balance < 1 even with full selection", async () => {
    useCreditsBalanceMock.mockReturnValue({
      balance: 0,
      walletAddress: "0xabc",
      loading: false,
      error: null,
      refetch: refetchBalanceMock,
    });
    render(<MarketingTab />);
    const select = await screen.findByTestId("product-picker-select");
    fireEvent.change(select, { target: { value: SAMPLE_PRODUCT.id } });
    fireEvent.click(screen.getByTestId("template-card-ig_square"));
    expect(screen.getByTestId("generate-btn")).toBeDisabled();
    // The hint also surfaces below the button.
    expect(screen.getByTestId("insufficient-credits-hint")).toBeInTheDocument();
  });

  it("enables the generate button when product, template, and balance are all set", async () => {
    render(<MarketingTab />);
    const select = await screen.findByTestId("product-picker-select");
    fireEvent.change(select, { target: { value: SAMPLE_PRODUCT.id } });
    fireEvent.click(screen.getByTestId("template-card-ig_square"));
    expect(screen.getByTestId("generate-btn")).not.toBeDisabled();
  });
});

describe("MarketingTab — caption language toggle", () => {
  it("switches between English and Swahili and reflects aria-pressed", async () => {
    render(<MarketingTab />);
    const enBtn = await screen.findByTestId("lang-toggle-en");
    const swBtn = screen.getByTestId("lang-toggle-sw");
    expect(enBtn).toHaveAttribute("aria-pressed", "true");
    expect(swBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(swBtn);
    expect(enBtn).toHaveAttribute("aria-pressed", "false");
    expect(swBtn).toHaveAttribute("aria-pressed", "true");
  });
});

describe("MarketingTab — generate flow", () => {
  it("calls generateImage and refreshes balance on success", async () => {
    generateImageMock.mockResolvedValue({
      ipfs_hash: "QmTestHash",
      image_url: "https://gateway.pinata.cloud/ipfs/QmTestHash",
      caption: "Test caption",
      template: "ig_square",
    });
    render(<MarketingTab />);
    const select = await screen.findByTestId("product-picker-select");
    fireEvent.change(select, { target: { value: SAMPLE_PRODUCT.id } });
    fireEvent.click(screen.getByTestId("template-card-ig_square"));
    fireEvent.click(screen.getByTestId("generate-btn"));
    await waitFor(() => expect(generateImageMock).toHaveBeenCalledTimes(1));
    expect(generateImageMock).toHaveBeenCalledWith(
      "0xabc0000000000000000000000000000000000001",
      {
        product_id: SAMPLE_PRODUCT.id,
        template: "ig_square",
        caption_lang: "en",
      },
    );
    await waitFor(() => expect(refetchBalanceMock).toHaveBeenCalled());
    expect(await screen.findByTestId("generated-assets")).toBeInTheDocument();
  });
});
