"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createWalletClient,
  custom,
  keccak256,
  stringToBytes,
  type Abi,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { toast } from "sonner";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The order's UUID (DB) for fetching items, and onchain id for the tx.
  dbOrderId: string;
  onchainOrderId: number;
  onSuccess: () => void;
}

export function MarkGroupShippedDialog({
  open,
  onOpenChange,
  dbOrderId,
  onchainOrderId,
  onSuccess,
}: Props) {
  const { data: walletClient, refetch: refetchWalletClient } =
    useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { address } = useAccount();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [itemIds, setItemIds] = useState<bigint[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch item ids on open: shipItemsGrouped requires the contract's
  // uint256[] of itemIds (per ABI). The boutique-facing OrderItem doesn't
  // expose them, so we hit /api/v1/orders/{uuid}/items.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItemIds(null);
    setFetchError(null);
    setTxHash(null);
    setTrackingNumber("");

    fetchApi(`/orders/${dbOrderId}/items`)
      .then((res) => {
        if (!res.ok) throw new Error(`Items fetch failed: ${res.status}`);
        return res.json();
      })
      .then((items: Array<{ onchain_item_id: number }>) => {
        if (cancelled) return;
        setItemIds(items.map((i) => BigInt(i.onchain_item_id)));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Fetch failed";
        setFetchError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [open, dbOrderId]);

  // Resolve a wallet client even when wagmi's async useWalletClient
  // hasn't materialized yet. In MiniPay, the connector reports the
  // address synchronously via useAccount but useWalletClient (a
  // useQuery wrapper) can still be `undefined` at click time —
  // the dialog then bailed silently. Two fallbacks:
  //  1. refetch() forces wagmi to re-run getWalletClient against the
  //     connector ; if MiniPay was just slow this resolves it.
  //  2. Build a viem client directly from window.ethereum. MiniPay
  //     always injects a provider inside its WebView, and the
  //     connector flag was already true when address resolved, so
  //     this changes the wrapper, not the wallet semantics.
  const resolveWalletClient = useCallback(async (): Promise<
    WalletClient | null
  > => {
    if (walletClient) return walletClient;
    try {
      const refetched = await refetchWalletClient();
      if (refetched.data) return refetched.data;
    } catch {
      // Swallow refetch errors and fall through to the direct path.
    }
    if (typeof window === "undefined" || !address) return null;
    const eth = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return null;
    return createWalletClient({
      chain: etaloChain,
      transport: custom(eth),
      account: address,
    });
  }, [walletClient, refetchWalletClient, address]);

  const handleConfirm = async () => {
    if (!publicClient || !itemIds || itemIds.length === 0) {
      toast.error("Order not ready. Please reopen the dialog.");
      return;
    }
    setSubmitting(true);
    try {
      const wc = await resolveWalletClient();
      if (!wc) {
        toast.error(
          "Wallet not connected. Reopen MiniPay and try again.",
        );
        return;
      }
      // bytes32 proof: keccak256 of the tracking text (or a stable
      // placeholder if blank). Real tracking docs land on IPFS in V1.5+.
      const proofText = trackingNumber.trim() || "etalo-v1-shipped";
      const proofHash = keccak256(stringToBytes(proofText));

      const tx = await wc.writeContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "shipItemsGrouped",
        args: [BigInt(onchainOrderId), itemIds, proofHash],
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

      toast.success("Order marked as shipped");
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
          <DialogTitle>Mark order as shipped?</DialogTitle>
          <DialogDescription>
            Order #{onchainOrderId} will be marked as shipped on-chain.
            This signals the buyer you&apos;ve sent the items and triggers
            partial escrow release per the order rules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="tracking-input"
              className="mb-1 block text-base font-medium"
            >
              Tracking reference (optional)
            </label>
            <input
              id="tracking-input"
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="e.g. DHL-1234567"
              className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
            />
            <p className="mt-1 text-sm text-neutral-500">
              Hashed on-chain as proof. Leave blank for a generic stamp.
            </p>
          </div>

          {fetchError ? (
            <p className="text-sm text-red-600">
              Couldn&apos;t fetch order items: {fetchError}
            </p>
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
            disabled={submitting || !itemIds || itemIds.length === 0}
            className="min-h-[44px]"
          >
            {submitting ? "Confirming…" : "Mark as shipped"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
