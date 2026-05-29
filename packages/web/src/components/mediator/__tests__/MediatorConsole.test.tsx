/**
 * Vitest specs for MediatorConsole (ADR-056 / PR 2).
 *
 * Covers the four states the wallet-gated mediator route can land in:
 * no wallet, on-chain check pending → not approved, empty queue,
 * non-empty queue.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MediatorConsole } from "@/components/mediator/MediatorConsole";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";

const useAccountMock = vi.fn();
const useIsMediatorMock = vi.fn();
const useMediatorQueueMock = vi.fn();

vi.mock("wagmi", () => ({
  useAccount: () => useAccountMock(),
}));
vi.mock("@/hooks/useIsMediator", () => ({
  useIsMediator: (...args: unknown[]) => useIsMediatorMock(...args),
}));
vi.mock("@/hooks/useMediatorQueue", () => ({
  useMediatorQueue: (...args: unknown[]) => useMediatorQueueMock(...args),
  MEDIATOR_QUEUE_QUERY_KEY: "mediator-queue",
}));
// Stub the per-dispute form so the console test stays focused on
// orchestration ; the form has its own coverage in PR 2 follow-ups.
vi.mock("@/components/mediator/N2ResolutionForm", () => ({
  N2ResolutionForm: ({ dispute }: { dispute: DisputeResponse }) => (
    <div data-testid="n2-form-stub" data-dispute-id={dispute.onchain_dispute_id} />
  ),
}));

const MED = "0xmed0000000000000000000000000000000000001";

function dispute(overrides: Partial<DisputeResponse>): DisputeResponse {
  return {
    id: "dispute-uuid",
    onchain_dispute_id: 5,
    order_id: "order-uuid",
    order_item_id: "item-uuid",
    buyer_address: "0xbuyer",
    seller_address: "0xseller",
    level: "N2_Mediation",
    n2_mediator_address: MED,
    refund_amount_usdt: 0,
    slash_amount_usdt: 0,
    favor_buyer: null,
    resolved: false,
    reason: "Item not as described",
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

describe("MediatorConsole", () => {
  it("prompts to connect when no wallet is present", () => {
    useAccountMock.mockReturnValue({ address: undefined, isConnecting: false });
    useIsMediatorMock.mockReturnValue({ data: undefined, isPending: false });
    useMediatorQueueMock.mockReturnValue({ data: null, isPending: false });

    render(<MediatorConsole />);
    expect(screen.getByTestId("mediator-no-wallet")).toBeInTheDocument();
  });

  it("rejects a connected wallet that is not on the approved whitelist", () => {
    useAccountMock.mockReturnValue({ address: MED, isConnecting: false });
    useIsMediatorMock.mockReturnValue({ data: false, isPending: false });
    useMediatorQueueMock.mockReturnValue({ data: null, isPending: false });

    render(<MediatorConsole />);
    expect(screen.getByTestId("mediator-not-approved")).toBeInTheDocument();
    expect(screen.queryByTestId("mediator-console")).toBeNull();
  });

  it("renders the empty state when no disputes are assigned", () => {
    useAccountMock.mockReturnValue({ address: MED, isConnecting: false });
    useIsMediatorMock.mockReturnValue({ data: true, isPending: false });
    useMediatorQueueMock.mockReturnValue({
      data: { assigned_n2: [], open_votes: [] },
      isPending: false,
    });

    render(<MediatorConsole />);
    expect(screen.getByTestId("mediator-console")).toBeInTheDocument();
    expect(screen.getByTestId("mediator-empty")).toBeInTheDocument();
  });

  it("renders one N2 form per assigned dispute", () => {
    useAccountMock.mockReturnValue({ address: MED, isConnecting: false });
    useIsMediatorMock.mockReturnValue({ data: true, isPending: false });
    useMediatorQueueMock.mockReturnValue({
      data: {
        assigned_n2: [
          dispute({ id: "d1", onchain_dispute_id: 5 }),
          dispute({ id: "d2", onchain_dispute_id: 6 }),
        ],
        open_votes: [],
      },
      isPending: false,
    });

    render(<MediatorConsole />);
    const stubs = screen.getAllByTestId("n2-form-stub");
    expect(stubs).toHaveLength(2);
    expect(stubs[0]).toHaveAttribute("data-dispute-id", "5");
    expect(stubs[1]).toHaveAttribute("data-dispute-id", "6");
  });
});
