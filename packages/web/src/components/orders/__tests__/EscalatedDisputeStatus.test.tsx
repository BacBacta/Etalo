/**
 * Vitest specs for EscalatedDisputeStatus (ADR-056 / PR 3).
 *
 * Covers the buyer/seller-facing read-only N2 + N3 status surfaces that
 * replace the previous "handled off-app" placeholder. N3 reads from
 * `useDisputeVote` (mocked here).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EscalatedDisputeStatus } from "@/components/orders/EscalatedDisputeStatus";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";

const useDisputeVoteMock = vi.fn();

vi.mock("@/hooks/useDisputeVote", () => ({
  DISPUTE_VOTE_QUERY_KEY: "dispute-vote",
  useDisputeVote: (...args: unknown[]) => useDisputeVoteMock(...args),
}));
vi.mock("@/components/orders/AutoReleaseTimer", () => ({
  DeadlineCountdown: () => <span data-testid="deadline-countdown" />,
}));

function dispute(overrides: Partial<DisputeResponse>): DisputeResponse {
  return {
    id: "dispute-uuid",
    onchain_dispute_id: 5,
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

describe("EscalatedDisputeStatus — N2", () => {
  it("renders the N2 card with the 'mediator assigned' copy when an address is set", () => {
    render(
      <EscalatedDisputeStatus
        dispute={dispute({
          level: "N2_Mediation",
          n2_mediator_address: "0xmediator",
        })}
      />,
    );
    expect(screen.getByTestId("n2-status-card")).toBeInTheDocument();
    expect(
      screen.getByText(/A neutral mediator has been assigned/i),
    ).toBeInTheDocument();
  });

  it("renders the N2 card with the 'awaiting assignment' copy when no mediator yet", () => {
    render(
      <EscalatedDisputeStatus
        dispute={dispute({ level: "N2_Mediation", n2_mediator_address: null })}
      />,
    );
    expect(screen.getByTestId("n2-status-card")).toBeInTheDocument();
    expect(
      screen.getByText(/Awaiting mediator assignment/i),
    ).toBeInTheDocument();
  });
});

describe("EscalatedDisputeStatus — N3", () => {
  it("renders tallies when the vote mirror is populated", () => {
    useDisputeVoteMock.mockReturnValue({
      data: {
        onchain_vote_id: 1,
        onchain_dispute_id: 5,
        deadline: "2099-01-01T00:00:00Z",
        for_buyer: 3,
        for_seller: 1,
        finalized: false,
        buyer_won: null,
        created_at: "2026-05-01T00:00:00Z",
      },
      isPending: false,
    });

    render(
      <EscalatedDisputeStatus dispute={dispute({ level: "N3_Voting" })} />,
    );
    expect(screen.getByTestId("n3-status-card")).toBeInTheDocument();
    expect(screen.getByTestId("n3-tally-for-buyer").textContent).toBe("3");
    expect(screen.getByTestId("n3-tally-for-seller").textContent).toBe("1");
  });

  it("renders an 'awaiting indexer' note while the vote hasn't been mirrored yet", () => {
    useDisputeVoteMock.mockReturnValue({ data: null, isPending: false });

    render(
      <EscalatedDisputeStatus dispute={dispute({ level: "N3_Voting" })} />,
    );
    expect(screen.getByTestId("n3-status-card")).toBeInTheDocument();
    expect(
      screen.getByText(/Awaiting vote details from the indexer/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("n3-tally-for-buyer")).toBeNull();
  });
});
