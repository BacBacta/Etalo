/**
 * Vitest specs for N1ResolutionCard — guard ordering + escalate CTA.
 *
 * Covers the two PR-B fixes:
 *  - resolved disputes render the "resolved" state (not the escalated
 *    "off-app" notice) — the guard order was inverted before.
 *  - past the 48 h window, the buyer sees an "Escalate to mediation"
 *    button wired to useEscalateToMediation.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { N1ResolutionCard } from "@/components/orders/N1ResolutionCard";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";

const escalateRun = vi.fn();

vi.mock("@/hooks/useEscalateToMediation", () => ({
  useEscalateToMediation: () => ({
    state: { phase: "idle" },
    run: escalateRun,
    reset: vi.fn(),
  }),
}));
vi.mock("@/hooks/useResolveN1Amicable", () => ({
  useResolveN1Amicable: () => ({
    state: { phase: "idle" },
    run: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("@/hooks/useN1Proposal", () => ({
  N1_PROPOSAL_QUERY_KEY: "n1-proposal",
  useN1Proposal: () => ({ data: null }),
}));
vi.mock("@/components/wallet/ChainMismatchBanner", () => ({
  useChainMatch: () => ({ isMatch: true }),
  ChainMismatchBanner: () => null,
}));
vi.mock("@/components/orders/AutoReleaseTimer", () => ({
  DeadlineCountdown: () => <span data-testid="deadline-countdown" />,
}));

const BUYER = "0xbuyer000000000000000000000000000000000001";
const SELLER = "0xseller00000000000000000000000000000000002";

function makeDispute(overrides: Partial<DisputeResponse> = {}): DisputeResponse {
  return {
    id: "dispute-1",
    onchain_dispute_id: 5,
    order_id: "order-1",
    order_item_id: "item-1",
    buyer_address: BUYER,
    seller_address: SELLER,
    level: "N1_Amicable",
    n2_mediator_address: null,
    refund_amount_usdt: 0,
    slash_amount_usdt: 0,
    favor_buyer: null,
    resolved: false,
    reason: "Item not as described",
    opened_at: "2026-05-01T00:00:00Z",
    n1_deadline: "2999-01-01T00:00:00Z", // far future = not elapsed by default
    n2_deadline: null,
    resolved_at: null,
    buyer_proposal_amount_usdt: null,
    seller_proposal_amount_usdt: null,
    vote_id: null,
    ...overrides,
  };
}

describe("N1ResolutionCard — guard ordering", () => {
  it("renders the resolved state for a settled dispute (level=Resolved)", () => {
    render(
      <N1ResolutionCard
        dispute={makeDispute({ resolved: true, level: "Resolved" })}
        currentUserAddress={BUYER}
        itemPriceRawUsdt={15_000_000}
      />,
    );
    expect(screen.getByTestId("n1-card-resolved")).toBeInTheDocument();
    // The inverted-guard bug would have shown the escalated notice here.
    expect(screen.queryByTestId("n1-card-escalated")).toBeNull();
  });

  it("renders the escalated notice for a non-resolved dispute past N1", () => {
    render(
      <N1ResolutionCard
        dispute={makeDispute({ level: "N2_Mediation" })}
        currentUserAddress={BUYER}
        itemPriceRawUsdt={15_000_000}
      />,
    );
    expect(screen.getByTestId("n1-card-escalated")).toBeInTheDocument();
  });
});

describe("N1ResolutionCard — escalate CTA", () => {
  it("shows the escalate button to the buyer once the 48h window elapsed", () => {
    render(
      <N1ResolutionCard
        dispute={makeDispute({ n1_deadline: "2020-01-01T00:00:00Z" })}
        currentUserAddress={BUYER}
        itemPriceRawUsdt={15_000_000}
      />,
    );
    const btn = screen.getByTestId("n1-escalate-btn");
    fireEvent.click(btn);
    expect(escalateRun).toHaveBeenCalledWith({ disputeId: BigInt(5) });
    // Past the window the new-proposal form is replaced by the CTA.
    expect(screen.queryByTestId("n1-propose-btn")).toBeNull();
  });

  it("does NOT show the escalate button before the deadline (proposal form instead)", () => {
    render(
      <N1ResolutionCard
        dispute={makeDispute({ n1_deadline: "2999-01-01T00:00:00Z" })}
        currentUserAddress={BUYER}
        itemPriceRawUsdt={15_000_000}
      />,
    );
    expect(screen.queryByTestId("n1-escalate-btn")).toBeNull();
    expect(screen.getByTestId("n1-propose-btn")).toBeInTheDocument();
  });
});
