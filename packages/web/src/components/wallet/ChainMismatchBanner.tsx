"use client";

import { Warning } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useChainId, useSwitchChain } from "wagmi";

import { etaloChain } from "@/lib/chain";
import { Button } from "@/components/ui/button";

/**
 * Tells consumers whether the wallet's current chain matches the
 * target chain (defaults to `etaloChain`, which itself flips between
 * mainnet and Sepolia from `NEXT_PUBLIC_CHAIN_ID`).
 *
 * Surfaced as a hook so a parent can gate its CTA (the "Mark as
 * shipped" button only makes sense when chains line up) without
 * having to derive the state itself or duplicate the comparison.
 */
export function useChainMatch(targetChainId: number = etaloChain.id) {
  const currentChainId = useChainId();
  return {
    isMatch: currentChainId === targetChainId,
    currentChainId,
    targetChainId,
  };
}

interface Props {
  /** Defaults to `etaloChain.id` ; pass to override for testing. */
  targetChainId?: number;
}

/**
 * Banner that renders only when the wallet is on the wrong chain.
 *
 * Why a dedicated component instead of an inline check in each
 * dialog : the same bug bites every seller/buyer action that ends in
 * a `writeContract`. Concentrating the UX (warning copy + Switch
 * button + MiniPay-specific fallback instructions) means the next
 * dialog that needs the guard imports one component, not a
 * checklist.
 *
 * Behavior :
 * - On click "Switch network", tries `wallet_switchEthereumChain`
 *   via wagmi's `useSwitchChain`. Standard wallets (MetaMask, etc.)
 *   prompt the user.
 * - MiniPay typically rejects the switch RPC — its "MiniPay Test"
 *   toggle is owned by the app settings, not the dapp. We surface
 *   the explicit instruction in that case rather than leaving the
 *   seller staring at a generic "switch failed".
 */
export function ChainMismatchBanner({ targetChainId }: Props) {
  const target = targetChainId ?? etaloChain.id;
  const { isMatch, currentChainId } = useChainMatch(target);
  const { switchChainAsync, isPending } = useSwitchChain();
  const [needsManualSwitch, setNeedsManualSwitch] = useState(false);

  const handleSwitch = useCallback(async () => {
    try {
      // Cast: wagmi's typed Register narrows chainId to the registered
      // chain ids (42220 | 11142220). `target` is `number` to keep the
      // prop API generic ; the runtime value is always one of those two
      // since `etaloChain.id` is the only source.
      await switchChainAsync({
        chainId: target as 42220 | 11142220,
      });
      toast.success(`Switched to ${etaloChain.name}`);
    } catch {
      // MiniPay rejects wallet_switchEthereumChain — there's no
      // automatic path back, the seller has to flip the app
      // setting. Swap the in-banner UI to show that instruction.
      setNeedsManualSwitch(true);
    }
  }, [switchChainAsync, target]);

  if (isMatch) return null;

  return (
    <div
      role="alert"
      data-testid="chain-mismatch-banner"
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40"
    >
      <div className="flex items-start gap-2">
        <Warning
          className="h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-300"
          weight="fill"
          aria-hidden
        />
        <div className="space-y-2">
          <p className="text-amber-900 dark:text-amber-100">
            Your wallet is on a different network (id {currentChainId}).
            This action sends a transaction to{" "}
            <span className="font-medium">{etaloChain.name}</span> (id{" "}
            {target}).
          </p>

          {needsManualSwitch ? (
            <p className="text-amber-900 dark:text-amber-100">
              MiniPay can&apos;t switch from the dapp. Open MiniPay
              settings, disable <strong>MiniPay Test</strong> mode,
              then reopen this page.
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={handleSwitch}
              disabled={isPending}
              className="min-h-[44px]"
            >
              {isPending ? "Switching…" : `Switch to ${etaloChain.name}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
