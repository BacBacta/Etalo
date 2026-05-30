/**
 * Vitest specs for EscalatedDisputeStatus (ADR-056).
 *
 * Covers:
 * - N2 read-only status (assigned / awaiting)
 * - N3 tallies read-only
 * - N3 vote buttons for eligible mediator-voters
 * - N3 "already voted" state
 * - N3 finalize button post-deadline
 * - N3 finalized result display
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EscalatedDisputeStatus } from "@/components/orders/EscalatedDisputeStatus";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";

const useDisputeVoteMock = vi.fn();
const useIsMediatorMock = vi.fn();
const useHasVotedMock = vi.fn();
const submitVoteRun = vi.fn();
const finalizeVoteRun = vi.fn();
const useAccountMock = vi.fn();

vi.mock("wagmi", () => ({
  useAccount: () => useAccountMock(),
}));
vi.mock("@/hooks/useDisputeVote", () => ({
  DISPUTE_VOTE_QUERY_KEY: "dispute-vote",
  useDisputeVote: (...args: unknown[]) => useDisputeVoteMock(...args),
}));
vi.mock("@/hooks/useIsMediator", () => ({
  useIsMediator: (...args: unknown[]) => useIsMediatorMock(...args),
}));
vi.mock("@/hooks/useHasVoted", () => ({
  useHasVoted: (...args: unknown[]) => useHasVotedMock(...args),
}));
vi.mock("@/hooks/useSubmitVote", () => ({
  useSubmitVote: () => ({
    state: { phase: "idle" },
    run: submitVoteRun,
    reset: vi.fn(),
  }),
}));
vi.mock("@/hooks/useFinalizeVote", () => ({
  useFinalizeVote: () => ({
    state: { phase: "idle" },
    run: finalizeVoteRun,
    reset: vi.fn(),
  }),
}));
vi.mock("@/components/orders/AutoReleaseTimer", () => ({
  DeadlineCountdown: () => <span data-testid="deadline-countdown" />,
}));
vi.mock("@/components/wallet/ChainMismatchBanner", () => ({
  useChainMatch: () => ({ isMatch: true }),
  ChainMismatchBanner: () => null,
}));

const VOTE_OPEN = {
  onchain_vote_id: 1,
  onchain_dispute_id: 5,
  deadline: "2099-01-01T00:00:00Z", // far future = open
  for_buyer: 2,
  for_seller: 1,
  finalized: false,
  buyer_won: null,
  created_at: "2026-05-01T00:00:00Z",
};

const VOTE_CLOSED = {
  ...VOTE_OPEN,
  deadline: "2020-01-01T00:00:00Z", // past = closed
};

const VOTE_FINALIZED = {
  ...VOTE_CLOSED,
  finalized: true,
  buyer_won: true,
};

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
    vote_id: 1,
    ...overrides,
  };
}

function defaultHooks() {
  useAccountMock.mockReturnValue({ address: undefined });
  useIsMediatorMock.mockReturnValue({ data: false });
  useHasVotedMock.mockReturnValue({ data: false });
}

describe("EscalatedDisputeStatus — N2", () => {
  it("renders the N2 card with the 'mediator assigned' copy when an address is set", () => {
    render(
      <EscalatedDisputeStatus
        dispute={dispute({ level: "N2_Mediation", n2_mediator_address: "0xmediator" })}
      />,
    );
    expect(screen.getByTestId("n2-status-card")).toBeInTheDocument();
    expect(screen.getByText(/A neutral mediator has been assigned/i)).toBeInTheDocument();
  });

  it("renders the N2 card with the 'awaiting assignment' copy when no mediator yet", () => {
    render(
      <EscalatedDisputeStatus
        dispute={dispute({ level: "N2_Mediation", n2_mediator_address: null })}
      />,
    );
    expect(screen.getByTestId("n2-status-card")).toBeInTheDocument();
    expect(screen.getByText(/Awaiting mediator assignment/i)).toBeInTheDocument();
  });
});

describe("EscalatedDisputeStatus — N3 read-only", () => {
  it("renders tallies when the vote mirror is populated", () => {
    defaultHooks();
    useDisputeVoteMock.mockReturnValue({ data: VOTE_OPEN, isPending: false });

    render(<EscalatedDisputeStatus dispute={dispute({ level: "N3_Voting" })} />);
    expect(screen.getByTestId("n3-status-card")).toBeInTheDocument();
    expect(screen.getByTestId("n3-tally-for-buyer").textContent).toBe("2");
    expect(screen.getByTestId("n3-tally-for-seller").textContent).toBe("1");
    // Non-mediator wallet → no vote buttons
    expect(screen.queryByTestId("n3-vote-buyer")).toBeNull();
  });

  it("renders an 'awaiting indexer' note while the vote hasn't been mirrored yet", () => {
    defaultHooks();
    useDisputeVoteMock.mockReturnValue({ data: null, isPending: false });

    render(<EscalatedDisputeStatus dispute={dispute({ level: "N3_Voting" })} />);
    expect(screen.getByText(/Awaiting vote details from the indexer/i)).toBeInTheDocument();
    expect(screen.queryByTestId("n3-tally-for-buyer")).toBeNull();
  });
});

describe("EscalatedDisputeStatus — N3 mediator vote actions", () => {
  it("shows vote buttons to an eligible mediator on an open vote", () => {
    useAccountMock.mockReturnValue({ address: "0xmediator" });
    useIsMediatorMock.mockReturnValue({ data: true });
    useHasVotedMock.mockReturnValue({ data: false });
    useDisputeVoteMock.mockReturnValue({ data: VOTE_OPEN, isPending: false });

    render(<EscalatedDisputeStatus dispute={dispute({ level: "N3_Voting" })} />);
    expect(screen.getByTestId("n3-vote-buyer")).toBeInTheDocument();
    expect(screen.getByTestId("n3-vote-seller")).toBeInTheDocument();
  });

  it("fires submitVote(favorBuyer=true) when 'Favour buyer' is clicked", () => {
    useAccountMock.mockReturnValue({ address: "0xmediator" });
    useIsMediatorMock.mockReturnValue({ data: true });
    useHasVotedMock.mockReturnValue({ data: false });
    useDisputeVoteMock.mockReturnValue({ data: VOTE_OPEN, isPending: false });

    render(<EscalatedDisputeStatus dispute={dispute({ level: "N3_Voting", vote_id: 1 })} />);
    fireEvent.click(screen.getByTestId("n3-vote-buyer"));
    expect(submitVoteRun).toHaveBeenCalledWith({ voteId: BigInt(1), favorBuyer: true });
  });

  it("shows 'already voted' when the mediator has cast their ballot", () => {
    useAccountMock.mockReturnValue({ address: "0xmediator" });
    useIsMediatorMock.mockReturnValue({ data: true });
    useHasVotedMock.mockReturnValue({ data: true }); // already voted
    useDisputeVoteMock.mockReturnValue({ data: VOTE_OPEN, isPending: false });

    render(<EscalatedDisputeStatus dispute={dispute({ level: "N3_Voting" })} />);
    expect(screen.getByTestId("n3-already-voted")).toBeInTheDocument();
    expect(screen.queryByTestId("n3-vote-buyer")).toBeNull();
  });

  it("shows the finalize button once the vote is closed", () => {
    defaultHooks();
    useDisputeVoteMock.mockReturnValue({ data: VOTE_CLOSED, isPending: false });

    render(<EscalatedDisputeStatus dispute={dispute({ level: "N3_Voting", vote_id: 1 })} />);
    const btn = screen.getByTestId("n3-finalize-btn");
    fireEvent.click(btn);
    expect(finalizeVoteRun).toHaveBeenCalledWith({ voteId: BigInt(1) });
  });

  it("shows the finalized result (buyer won) once the vote is done", () => {
    defaultHooks();
    useDisputeVoteMock.mockReturnValue({ data: VOTE_FINALIZED, isPending: false });

    render(<EscalatedDisputeStatus dispute={dispute({ level: "N3_Voting" })} />);
    expect(screen.getByTestId("n3-finalized")).toBeInTheDocument();
    expect(screen.getByText(/buyer wins/i)).toBeInTheDocument();
    expect(screen.queryByTestId("n3-finalize-btn")).toBeNull();
  });
});
