/**
 * BlockscoutLinkButton — links the buyer to the on-chain escrow
 * contract page on Blockscout for transparency. J11.5 Block 4.D.
 *
 * V1 caveat : we don't yet have the order's createOrder tx_hash in
 * `OrderResponse` (FU candidate). Linking to the escrow contract
 * address is the next-best transparency anchor — the buyer can
 * inspect events / read storage there. Future iteration : pin the
 * URL to a specific log entry once the indexer surfaces tx_hash.
 *
 * Hard-coded to Celo Sepolia for V1 (mainnet swap to celoscan.io
 * comes with the J12 mainnet deploy + chain switch).
 */
import { ArrowSquareOut } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

const BLOCKSCOUT_BASE = "https://celo-sepolia.blockscout.com";

export interface BlockscoutLinkButtonProps {
  className?: string;
}

export function BlockscoutLinkButton({ className }: BlockscoutLinkButtonProps) {
  const escrowAddress = process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
  if (!escrowAddress) return null;

  const href = `${BLOCKSCOUT_BASE}/address/${escrowAddress}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="blockscout-link-button"
      className={cn(
        "inline-flex items-center justify-center gap-2",
        "min-h-[44px] px-4 rounded-pill border border-slate-300 bg-white",
        "text-sm font-medium text-slate-700",
        "hover:bg-slate-50 hover:border-slate-400",
        "dark:border-celo-dark-surface dark:bg-celo-dark-bg dark:text-celo-light",
        "dark:hover:border-celo-light/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2",
        "transition-colors duration-150",
        className,
      )}
    >
      <span>View escrow on Blockscout</span>
      <ArrowSquareOut size={16} weight="regular" aria-hidden="true" />
    </a>
  );
}
