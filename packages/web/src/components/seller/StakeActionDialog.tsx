"use client";

import { useEffect, useState } from "react";
import { erc20Abi, parseUnits, type Abi } from "viem";
import { toast } from "sonner";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import stakeAbiJson from "@/abis/v2/EtaloStake.json";
import {
  buildExplorerUrl,
  classifyError,
} from "@/lib/checkout-orchestration";

const stakeAbi = stakeAbiJson as Abi;
const STAKE_ADDRESS = process.env.NEXT_PUBLIC_STAKE_ADDRESS as `0x${string}`;
const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;
const TX_TIMEOUT_MS = 120_000;

// EtaloTypes.StakeTier — uint8 mapping aligned with backend / contract.
const TIER_VALUE: Record<string, number> = {
  None: 0,
  Starter: 1,
  Established: 2,
  TopSeller: 3,
};

const TIER_REQUIRED_USDT: Record<string, string> = {
  Starter: "10",
  Established: "25",
  TopSeller: "50",
};

export type StakeAction = "deposit" | "topUp" | "withdraw";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: StakeAction;
  currentTier: string;
  onSuccess: () => void;
}

export function StakeActionDialog({
  open,
  onOpenChange,
  action,
  currentTier,
  onSuccess,
}: Props) {
  const { address: buyer } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  // Form state
  const [tierChoice, setTierChoice] = useState<keyof typeof TIER_VALUE>("Starter");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [withdrawTier, setWithdrawTier] = useState<keyof typeof TIER_VALUE>("None");

  // Tx state
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"idle" | "approving" | "submitting">(
    "idle",
  );
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    if (!open) return;
    setTierChoice("Starter");
    setTopUpAmount("");
    setWithdrawTier("None");
    setSubmitting(false);
    setPhase("idle");
    setTxHash(null);
  }, [open]);

  // ====== Tx helpers ======
  const ensureAllowance = async (amount: bigint): Promise<void> => {
    if (!walletClient || !publicClient || !buyer) return;
    const current = (await publicClient.readContract({
      address: USDT_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [buyer, STAKE_ADDRESS],
    })) as bigint;
    if (current >= amount) return;

    setPhase("approving");
    const approveTx = await walletClient.writeContract({
      address: USDT_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [STAKE_ADDRESS, amount],
      type: "legacy" as const,
    });
    setTxHash(approveTx);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: approveTx,
      timeout: TX_TIMEOUT_MS,
    });
    if (receipt.status !== "success") {
      throw new Error("Approve transaction reverted");
    }
  };

  const handleDeposit = async () => {
    if (!walletClient || !publicClient) return;
    const tierU8 = TIER_VALUE[tierChoice];
    const required = parseUnits(TIER_REQUIRED_USDT[tierChoice], 6);

    await ensureAllowance(required);

    setPhase("submitting");
    const tx = await walletClient.writeContract({
      address: STAKE_ADDRESS,
      abi: stakeAbi,
      functionName: "depositStake",
      args: [tierU8],
      type: "legacy" as const,
    });
    setTxHash(tx);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: tx,
      timeout: TX_TIMEOUT_MS,
    });
    if (receipt.status !== "success") {
      throw new Error("Deposit reverted");
    }
  };

  const handleTopUp = async () => {
    if (!walletClient || !publicClient) return;
    const amountNum = Number(topUpAmount);
    if (!topUpAmount || Number.isNaN(amountNum) || amountNum <= 0) {
      throw new Error("Enter a positive USDT amount");
    }
    const amount = parseUnits(topUpAmount, 6);

    await ensureAllowance(amount);

    setPhase("submitting");
    const tx = await walletClient.writeContract({
      address: STAKE_ADDRESS,
      abi: stakeAbi,
      functionName: "topUpStake",
      args: [amount],
      type: "legacy" as const,
    });
    setTxHash(tx);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: tx,
      timeout: TX_TIMEOUT_MS,
    });
    if (receipt.status !== "success") {
      throw new Error("Top up reverted");
    }
  };

  const handleWithdraw = async () => {
    if (!walletClient || !publicClient) return;

    setPhase("submitting");
    const tx = await walletClient.writeContract({
      address: STAKE_ADDRESS,
      abi: stakeAbi,
      functionName: "initiateWithdrawal",
      args: [TIER_VALUE[withdrawTier]],
      type: "legacy" as const,
    });
    setTxHash(tx);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: tx,
      timeout: TX_TIMEOUT_MS,
    });
    if (receipt.status !== "success") {
      throw new Error("Withdrawal initiation reverted");
    }
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      if (action === "deposit") await handleDeposit();
      else if (action === "topUp") await handleTopUp();
      else await handleWithdraw();

      toast.success(
        action === "withdraw"
          ? "Withdrawal initiated. Cooldown applies."
          : "Stake updated",
      );
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(classifyError(err));
    } finally {
      setSubmitting(false);
      setPhase("idle");
    }
  };

  const buttonLabel = (() => {
    if (submitting) {
      if (phase === "approving") return "Approving USDT…";
      if (phase === "submitting")
        return action === "deposit"
          ? "Depositing…"
          : action === "topUp"
            ? "Topping up…"
            : "Initiating…";
      return "Working…";
    }
    if (action === "deposit") return "Deposit stake";
    if (action === "topUp") return "Top up stake";
    return "Initiate withdrawal";
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {action === "deposit"
              ? "Deposit stake"
              : action === "topUp"
                ? "Top up stake"
                : "Initiate withdrawal"}
          </DialogTitle>
          <DialogDescription>
            {action === "deposit"
              ? "Choose a tier — the contract pulls the required USDT from your wallet."
              : action === "topUp"
                ? "Add USDT to your existing stake (does not change tier)."
                : "Sets a cooldown before you can execute the withdrawal. You stay protected until then."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {action === "deposit" ? (
            <div>
              <label
                htmlFor="tier-select"
                className="mb-1 block text-base font-medium"
              >
                Tier
              </label>
              <select
                id="tier-select"
                value={tierChoice}
                onChange={(e) =>
                  setTierChoice(e.target.value as keyof typeof TIER_VALUE)
                }
                className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
              >
                <option value="Starter">Starter — 10 USDT</option>
                <option value="Established">Established — 25 USDT</option>
                <option value="TopSeller">Top Seller — 50 USDT</option>
              </select>
            </div>
          ) : null}

          {action === "topUp" ? (
            <div>
              <label
                htmlFor="topup-amount"
                className="mb-1 block text-base font-medium"
              >
                Amount (USDT)
              </label>
              <input
                id="topup-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
              />
            </div>
          ) : null}

          {action === "withdraw" ? (
            <div>
              <p className="mb-2 text-sm text-neutral-600">
                Current tier: <strong>{currentTier}</strong>
              </p>
              <label
                htmlFor="withdraw-target"
                className="mb-1 block text-base font-medium"
              >
                Target tier
              </label>
              <select
                id="withdraw-target"
                value={withdrawTier}
                onChange={(e) =>
                  setWithdrawTier(e.target.value as keyof typeof TIER_VALUE)
                }
                className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
              >
                <option value="None">None (withdraw fully)</option>
                <option value="Starter">Starter (downgrade)</option>
                <option value="Established">Established (downgrade)</option>
              </select>
              <p className="mt-2 text-sm text-neutral-500">
                After cooldown you (or anyone) can call executeWithdrawal to
                receive the difference. Disputes pause the cooldown.
              </p>
            </div>
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
            disabled={submitting}
            className="min-h-[44px]"
          >
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
