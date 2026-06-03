"use client";

import { useEffect, useState } from "react";
import { keccak256, stringToBytes, type Abi } from "viem";
import { toast } from "sonner";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChainMismatchBanner,
  useChainMatch,
} from "@/components/wallet/ChainMismatchBanner";
import { useResolvedWalletClient } from "@/hooks/useResolvedWalletClient";
import escrowAbiJson from "@/abis/v2/EtaloEscrow.json";
import { etaloChain } from "@/lib/chain";
import {
  buildExplorerUrl,
  classifyError,
} from "@/lib/checkout-orchestration";
import { fetchApi } from "@/lib/fetch-api";

const escrowAbi = escrowAbiJson as Abi;
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;
const TX_TIMEOUT_MS = 120_000;
// 32 zero-bytes — passed when the seller requests early release without
// attaching a proof artifact (contract accepts bytes32(0)).
const ZERO_HASH = ("0x" + "00".repeat(32)) as `0x${string}`;

interface GroupJson {
  onchain_group_id: number;
  status: string; // "Shipped" | "Arrived" | ...
  early_release_requested?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Order UUID (DB) for fetching shipment groups. */
  dbOrderId: string;
  /** On-chain order id for the requestEarlyRelease call. */
  onchainOrderId: number;
  onSuccess: () => void;
}

/**
 * RequestEarlyReleaseDialog — ADR-057. Lets the seller submit proof of
 * delivery to shorten the auto-release window to 48h (instead of the
 * default 3 days), so they get paid faster without depending on the
 * buyer remembering to confirm receipt.
 *
 * The proof artifact is OPTIONAL : the seller may attach a reference
 * (photo link / courier ref / signature note) which is hashed on-chain
 * as dispute evidence, or skip it entirely (bytes32(0)). Either way the
 * buyer keeps full dispute rights inside the shortened window.
 */
export function RequestEarlyReleaseDialog({
  open,
  onOpenChange,
  dbOrderId,
  onchainOrderId,
  onSuccess,
}: Props) {
  const { resolve: resolveWalletClient } = useResolvedWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { address } = useAccount();
  const { isMatch: chainMatches } = useChainMatch();
  const [proofRef, setProofRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [groupId, setGroupId] = useState<bigint | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch the order's shipment groups on open and pick the first one
  // that's shipped/arrived and hasn't already had an early release
  // requested. requestEarlyRelease needs the on-chain group id.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setGroupId(null);
    setFetchError(null);
    setTxHash(null);
    setProofRef("");

    fetchApi(`/orders/${dbOrderId}/groups`)
      .then((res) => {
        if (!res.ok) throw new Error(`Groups fetch failed: ${res.status}`);
        return res.json();
      })
      .then((groups: GroupJson[]) => {
        if (cancelled) return;
        const eligible = groups.find(
          (g) =>
            (g.status === "Shipped" || g.status === "Arrived") &&
            !g.early_release_requested,
        );
        if (!eligible) {
          setFetchError("No shipped group is eligible for early release.");
          return;
        }
        setGroupId(BigInt(eligible.onchain_group_id));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : "Fetch failed");
      });
    return () => {
      cancelled = true;
    };
  }, [open, dbOrderId]);

  const handleConfirm = async () => {
    if (!publicClient || groupId === null) {
      toast.error("Order not ready. Please reopen the dialog.");
      return;
    }
    setSubmitting(true);
    try {
      const wc = await resolveWalletClient();
      if (!wc) {
        toast.error("Wallet not connected. Reopen MiniPay and try again.");
        return;
      }
      // Optional proof : hash the reference text when provided, else
      // pass bytes32(0) (contract accepts an empty proof).
      const trimmed = proofRef.trim();
      const proofHash = trimmed
        ? keccak256(stringToBytes(trimmed))
        : ZERO_HASH;

      const tx = await wc.writeContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "requestEarlyRelease",
        args: [BigInt(onchainOrderId), groupId, proofHash],
        type: "legacy" as const,
        chain: etaloChain,
        account: wc.account ?? (address as `0x${string}`),
      });
      setTxHash(tx);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx,
        timeout: TX_TIMEOUT_MS,
      });
      if (receipt.status !== "success") {
        throw new Error("Transaction reverted");
      }

      toast.success("Delivery confirmed — payout window shortened to 48h");
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(classifyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm delivery to speed up payout</DialogTitle>
          <DialogDescription>
            If you have proof this order was delivered, confirm it here.
            Your payout window drops from 3 days to 48 hours. The buyer can
            still raise an issue during that window, so this doesn&apos;t
            waive their protection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ChainMismatchBanner />
          <div>
            <label
              htmlFor="proof-input"
              className="mb-1 block text-base font-medium"
            >
              Proof of delivery (optional)
            </label>
            <input
              id="proof-input"
              type="text"
              value={proofRef}
              onChange={(e) => setProofRef(e.target.value)}
              placeholder="e.g. courier POD ref, photo link, signed-for note"
              className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
            />
            <p className="mt-1 text-sm text-neutral-500">
              Hashed on-chain as evidence if there&apos;s ever a dispute.
              Leave blank to confirm without attaching a reference.
            </p>
          </div>

          {fetchError ? (
            <p className="text-sm text-red-600">{fetchError}</p>
          ) : null}

          {txHash ? (
            <p className="text-sm">
              <a
                href={buildExplorerUrl(txHash, chainId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 underline"
              >
                View transaction
              </a>
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || groupId === null || !chainMatches}
            className="min-h-[44px]"
          >
            {submitting ? "Confirming…" : "Confirm delivery · speed up payout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
