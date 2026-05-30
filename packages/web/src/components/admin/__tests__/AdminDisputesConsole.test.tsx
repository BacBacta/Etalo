/**
 * Vitest specs for AdminDisputesConsole (ADR-056 / PR 4).
 *
 * Covers the wallet-gated state machine: no wallet → connect prompt,
 * non-owner → reject, owner without token → token input, owner with
 * token and a populated list → triage rows render + the assign-mediator
 * Safe panel surfaces for N2 disputes without an assigned mediator.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminDisputesConsole } from "@/components/admin/AdminDisputesConsole";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";

const useAccountMock = vi.fn();
const useIsSafeOwnerMock = vi.fn();
const useAdminTokenMock = vi.fn();
const useAdminDisputesMock = vi.fn();

vi.mock("wagmi", () => ({
  useAccount: () => useAccountMock(),
}));
vi.mock("@/hooks/useIsSafeOwner", () => ({
  useIsSafeOwner: (...args: unknown[]) => useIsSafeOwnerMock(...args),
}));
vi.mock("@/hooks/useAdminToken", () => ({
  useAdminToken: () => useAdminTokenMock(),
}));
vi.mock("@/hooks/useAdminDisputes", () => ({
  ADMIN_DISPUTES_QUERY_KEY: "admin-disputes",
  useAdminDisputes: (...args: unknown[]) => useAdminDisputesMock(...args),
}));

const OWNER = "0xcb56a1f46f8bc0ef9a83161678dabe49b847d047";

function dispute(overrides: Partial<DisputeResponse>): DisputeResponse {
  return {
    id: "dispute-uuid",
    onchain_dispute_id: 7,
    order_id: "order-uuid",
    order_item_id: "item-uuid",
    buyer_address: "0xbuyer",
    seller_address: "0xseller",
    level: "N2_Mediation",
    n2_mediator_address: null,
    refund_amount_usdt: 0,
    slash_amount_usdt: 0,
    favor_buyer: null,
    resolved: false,
    reason: "Wrong item",
    opened_at: "2026-05-01T00:00:00Z",
    n1_deadline: "2026-05-03T00:00:00Z",
    n2_deadline: "2026-05-10T00:00:00Z",
    resolved_at: null,
    buyer_proposal_amount_usdt: null,
    seller_proposal_amount_usdt: null,
    vote_id: null,
    ...overrides,
  };
}

function adminToken(token: string) {
  return {
    token,
    setToken: vi.fn(),
    clear: vi.fn(),
    hydrated: true,
  };
}

describe("AdminDisputesConsole", () => {
  it("prompts to connect when no wallet is present", () => {
    useAccountMock.mockReturnValue({ address: undefined });
    useIsSafeOwnerMock.mockReturnValue(false);
    useAdminTokenMock.mockReturnValue(adminToken(""));
    useAdminDisputesMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
    });

    render(<AdminDisputesConsole />);
    expect(screen.getByTestId("admin-no-wallet")).toBeInTheDocument();
  });

  it("rejects a connected wallet that is not a Safe owner", () => {
    useAccountMock.mockReturnValue({
      address: "0xnotanowner000000000000000000000000000abc",
    });
    useIsSafeOwnerMock.mockReturnValue(false);
    useAdminTokenMock.mockReturnValue(adminToken(""));
    useAdminDisputesMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
    });

    render(<AdminDisputesConsole />);
    expect(screen.getByTestId("admin-not-owner")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-disputes-console")).toBeNull();
  });

  it("asks for the admin token when an owner connects without one", () => {
    useAccountMock.mockReturnValue({ address: OWNER });
    useIsSafeOwnerMock.mockReturnValue(true);
    useAdminTokenMock.mockReturnValue(adminToken(""));
    useAdminDisputesMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
    });

    render(<AdminDisputesConsole />);
    expect(screen.getByTestId("admin-disputes-console")).toBeInTheDocument();
    expect(screen.getByTestId("admin-token-input")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-disputes-list")).toBeNull();
  });

  it("renders the empty state when the list is empty", () => {
    useAccountMock.mockReturnValue({ address: OWNER });
    useIsSafeOwnerMock.mockReturnValue(true);
    useAdminTokenMock.mockReturnValue(adminToken("secret"));
    useAdminDisputesMock.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });

    render(<AdminDisputesConsole />);
    expect(screen.getByTestId("admin-disputes-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-disputes-list")).toBeNull();
  });

  it("renders triage rows + the assign panel for N2 disputes without a mediator", () => {
    useAccountMock.mockReturnValue({ address: OWNER });
    useIsSafeOwnerMock.mockReturnValue(true);
    useAdminTokenMock.mockReturnValue(adminToken("secret"));
    useAdminDisputesMock.mockReturnValue({
      data: [
        dispute({ id: "d1", onchain_dispute_id: 7 }),
        dispute({
          id: "d2",
          onchain_dispute_id: 8,
          n2_mediator_address: "0xalready-assigned",
        }),
      ],
      isPending: false,
      isError: false,
    });

    render(<AdminDisputesConsole />);
    const rows = screen.getAllByTestId("admin-dispute-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-dispute-id", "7");
    expect(rows[1]).toHaveAttribute("data-dispute-id", "8");

    // First row (no mediator yet) surfaces the assign-mediator input;
    // the second row (already assigned) does not.
    const inputs = screen.getAllByTestId("assign-mediator-input");
    expect(inputs).toHaveLength(1);
  });
});
