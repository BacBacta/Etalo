/**
 * Vitest specs for CountryPromptBanner — Sprint J11.7 Block 5 (ADR-045).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CountryPromptBanner } from "@/components/CountryPromptBanner";

const updateMyUserMock = vi.fn();
vi.mock("@/lib/buyer-country", async () => {
  const actual = await vi.importActual<typeof import("@/lib/buyer-country")>(
    "@/lib/buyer-country",
  );
  return {
    ...actual,
    updateMyUser: (...args: unknown[]) => updateMyUserMock(...args),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

const TEST_WALLET = "0xabc1234567890abcdef1234567890abcdef12345";

describe("CountryPromptBanner", () => {
  beforeEach(() => {
    updateMyUserMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the prompt selector + save button", () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <CountryPromptBanner wallet={TEST_WALLET} />
      </Wrapper>,
    );
    expect(screen.getByTestId("country-prompt-banner")).toBeDefined();
    expect(screen.getByTestId("prompt-country-selector")).toBeDefined();
    expect(screen.getByTestId("prompt-country-save")).toBeDefined();
  });

  it("save is disabled until a country is picked", () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <CountryPromptBanner wallet={TEST_WALLET} />
      </Wrapper>,
    );
    const save = screen.getByTestId(
      "prompt-country-save",
    ) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it("calls updateMyUser when picking + saving + invokes onSaved", async () => {
    updateMyUserMock.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000001",
      wallet_address: TEST_WALLET,
      country: "GHA",
      language: "en",
      has_seller_profile: false,
      created_at: "2026-05-01T00:00:00Z",
    });
    const onSaved = vi.fn();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <CountryPromptBanner wallet={TEST_WALLET} onSaved={onSaved} />
      </Wrapper>,
    );

    const select = screen.getByTestId("prompt-country-selector");
    fireEvent.change(select, { target: { value: "GHA" } });
    const save = screen.getByTestId("prompt-country-save");
    fireEvent.click(save);

    await waitFor(() => {
      expect(updateMyUserMock).toHaveBeenCalledWith(TEST_WALLET, {
        country: "GHA",
      });
    });
    expect(onSaved).toHaveBeenCalledWith("GHA");
  });
});
