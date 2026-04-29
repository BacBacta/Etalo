"use client";

import {
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  XCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useChainId } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBuyCredits, type BuyCreditsPhase } from "@/hooks/useBuyCredits";
import {
  buildExplorerUrl,
  shortHash,
} from "@/lib/checkout-orchestration";
import { fireMilestone } from "@/lib/confetti/milestones";
import { USDT_PER_CREDIT } from "@/lib/contracts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired when the user clicks "Done" on the success view. The
   * parent should refetch /credits/balance — the indexer typically
   * mirrors CreditsPurchased within ~30s. */
  onSuccess?: () => void;
}

const PRESETS = [10, 50, 100, 250] as const;
const MAX_CUSTOM_CREDITS = 10_000;

const ONE_USDT_RAW = BigInt(1_000_000);
const ZERO = BigInt(0);

function usdtCostHuman(credits: bigint): string {
  // creditAmount × 150_000 raw, USDT 6 decimals → divide by 1e6.
  const raw = credits * USDT_PER_CREDIT;
  const integer = raw / ONE_USDT_RAW;
  const fraction = raw % ONE_USDT_RAW;
  if (fraction === ZERO) return integer.toString();
  // Trim trailing zeros for compact display (e.g. 1.5 not 1.500000).
  const fracStr = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  return `${integer}.${fracStr}`;
}

function isInFlight(phase: BuyCreditsPhase): boolean {
  return (
    phase === "checkingAllowance" ||
    phase === "approving" ||
    phase === "awaitingApproveReceipt" ||
    phase === "purchasing" ||
    phase === "awaitingPurchaseReceipt"
  );
}

function phaseLabel(phase: BuyCreditsPhase): string {
  switch (phase) {
    case "checkingAllowance":
      return "Checking USDT allowance…";
    case "approving":
      return "Approving USDT — confirm in your wallet";
    case "awaitingApproveReceipt":
      return "Waiting for approve confirmation…";
    case "purchasing":
      return "Buying credits — confirm in your wallet";
    case "awaitingPurchaseReceipt":
      return "Waiting for purchase confirmation…";
    default:
      return "";
  }
}

export function BuyCreditsDialog({ open, onOpenChange, onSuccess }: Props) {
  const chainId = useChainId();
  const { state, start, reset } = useBuyCredits();
  const inFlight = isInFlight(state.phase);

  const [presetCredits, setPresetCredits] = useState<number | null>(10);
  const [customAmount, setCustomAmount] = useState<string>("");

  // Reset hook state when the dialog closes — the next open should
  // start from idle, not show a stale success/error view.
  useEffect(() => {
    if (!open) {
      reset();
      setPresetCredits(10);
      setCustomAmount("");
    }
  }, [open, reset]);

  // J10-V5 Block 7 — celebrate the moment the success view appears
  // (not on Done click), so the burst is in-context with the cheering
  // copy. Fires once per success transition (re-entry needs a reset).
  useEffect(() => {
    if (state.phase === "success") {
      fireMilestone("credit-purchase");
    }
  }, [state.phase]);

  const creditAmount = useMemo<number | null>(() => {
    if (customAmount.trim() !== "") {
      const n = Number.parseInt(customAmount, 10);
      if (!Number.isFinite(n) || n <= 0 || n > MAX_CUSTOM_CREDITS) {
        return null;
      }
      return n;
    }
    return presetCredits;
  }, [customAmount, presetCredits]);

  const usdtCost = useMemo(
    () => (creditAmount ? usdtCostHuman(BigInt(creditAmount)) : "—"),
    [creditAmount],
  );

  const customAmountInvalid =
    customAmount.trim() !== "" && creditAmount === null;

  const closeIfNotInFlight = (next: boolean) => {
    if (inFlight && !next) return; // block close while a tx is in flight
    onOpenChange(next);
  };

  const handleBuy = async () => {
    if (!creditAmount || inFlight) return;
    await start(BigInt(creditAmount));
  };

  const handleDone = () => {
    onSuccess?.();
    onOpenChange(false);
  };

  const handleRetry = () => {
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={closeIfNotInFlight}>
      <DialogContent
        className="max-w-md"
        data-testid="buy-credits-dialog"
        onEscapeKeyDown={(e) => {
          if (inFlight) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (inFlight) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Buy marketing credits</DialogTitle>
          <DialogDescription>
            1 credit = 1 marketing image. 0.15 USDT each (immutable).
          </DialogDescription>
        </DialogHeader>

        {state.phase === "success" ? (
          <SuccessView
            credits={state.purchasedCredits}
            usdtSpent={state.usdtSpent}
            approveTx={state.approveTxHash}
            purchaseTx={state.purchaseTxHash}
            chainId={chainId}
            onDone={handleDone}
          />
        ) : state.phase === "error" ? (
          <ErrorView
            message={state.errorMessage ?? "Transaction failed."}
            onRetry={handleRetry}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <>
            <div className="space-y-4">
              <fieldset disabled={inFlight} className="space-y-3">
                <legend className="text-base font-medium">
                  Choose a preset
                </legend>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="radiogroup"
                  aria-label="Credit presets"
                >
                  {PRESETS.map((p) => {
                    const active =
                      customAmount.trim() === "" && presetCredits === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setPresetCredits(p);
                          setCustomAmount("");
                        }}
                        data-testid={`preset-${p}`}
                        className={`min-h-[64px] rounded-lg border-2 p-3 text-left transition-all ${
                          active
                            ? "border-neutral-900 bg-neutral-50"
                            : "border-neutral-200 hover:border-neutral-300"
                        }`}
                      >
                        <div className="text-lg font-semibold">{p} credits</div>
                        <div className="text-sm text-neutral-600">
                          {usdtCostHuman(BigInt(p))} USDT
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label
                    htmlFor="buy-credits-custom"
                    className="block text-base font-medium"
                  >
                    Or enter a custom amount
                  </label>
                  <input
                    id="buy-credits-custom"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_CUSTOM_CREDITS}
                    placeholder="e.g. 75"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    data-testid="custom-amount-input"
                    className="mt-1 min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
                  />
                  {customAmount.trim() !== "" && !customAmountInvalid && (
                    <p
                      className="mt-1 text-sm text-neutral-600"
                      data-testid="custom-amount-cost"
                    >
                      {customAmount} credits = {usdtCost} USDT
                    </p>
                  )}
                  {customAmountInvalid && (
                    <p
                      className="mt-1 text-sm text-red-600"
                      data-testid="custom-amount-error"
                    >
                      Enter an integer between 1 and {MAX_CUSTOM_CREDITS}.
                    </p>
                  )}
                </div>
              </fieldset>

              {inFlight && (
                <PhaseStatus
                  phase={state.phase}
                  approveTx={state.approveTxHash}
                  purchaseTx={state.purchaseTxHash}
                  chainId={chainId}
                />
              )}

              {state.phase === "canceled" && (
                <p
                  className="text-sm text-amber-700"
                  data-testid="canceled-hint"
                >
                  You cancelled the transaction. You can try again.
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={() => void handleBuy()}
                disabled={!creditAmount || inFlight}
                className="min-h-[48px] flex-1"
                data-testid="buy-cta"
              >
                {inFlight && (
                  <CircleNotch className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                )}
                {inFlight
                  ? "Processing…"
                  : creditAmount
                    ? `Buy ${creditAmount} credits for ${usdtCost} USDT`
                    : "Choose an amount"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={inFlight}
                className="min-h-[48px]"
                data-testid="cancel-btn"
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PhaseStatus({
  phase,
  approveTx,
  purchaseTx,
  chainId,
}: {
  phase: BuyCreditsPhase;
  approveTx?: `0x${string}`;
  purchaseTx?: `0x${string}`;
  chainId?: number;
}) {
  return (
    <div
      className="rounded-md border border-neutral-200 bg-neutral-50 p-3"
      data-testid="phase-status"
    >
      <div className="flex items-center gap-2 text-sm">
        <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />
        <span>{phaseLabel(phase)}</span>
      </div>
      {approveTx && (
        <a
          href={buildExplorerUrl(approveTx, chainId)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-neutral-600 underline"
        >
          Approve tx: {shortHash(approveTx)}{" "}
          <ArrowSquareOut className="h-3 w-3" aria-hidden />
        </a>
      )}
      {purchaseTx && (
        <a
          href={buildExplorerUrl(purchaseTx, chainId)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-xs text-neutral-600 underline"
        >
          Purchase tx: {shortHash(purchaseTx)}
        </a>
      )}
    </div>
  );
}

function SuccessView({
  credits,
  usdtSpent,
  approveTx,
  purchaseTx,
  chainId,
  onDone,
}: {
  credits: bigint | undefined;
  usdtSpent: bigint | undefined;
  approveTx?: `0x${string}`;
  purchaseTx?: `0x${string}`;
  chainId?: number;
  onDone: () => void;
}) {
  const usdtHuman =
    usdtSpent !== undefined ? usdtCostHuman(usdtSpent / USDT_PER_CREDIT) : "—";
  return (
    <div className="space-y-4" data-testid="success-view">
      <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-4">
        <CheckCircle className="mt-0.5 h-6 w-6 text-green-700" aria-hidden />
        <div>
          <h3 className="text-base font-semibold text-green-900">
            Purchase confirmed
          </h3>
          <p className="text-sm text-green-800">
            {credits !== undefined ? `+${credits.toString()} credits` : "Credits"}{" "}
            ({usdtHuman} USDT spent)
          </p>
          <p className="mt-1 text-xs text-green-700">
            Your balance updates within ~30 seconds as the indexer mirrors
            the on-chain event.
          </p>
        </div>
      </div>

      <div className="space-y-1 text-sm">
        {approveTx && (
          <a
            href={buildExplorerUrl(approveTx, chainId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-neutral-700 underline"
          >
            Approve tx: {shortHash(approveTx)}{" "}
            <ArrowSquareOut className="h-3 w-3" aria-hidden />
          </a>
        )}
        {purchaseTx && (
          <a
            href={buildExplorerUrl(purchaseTx, chainId)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-neutral-700 underline"
            data-testid="success-purchase-tx-link"
          >
            Purchase tx: {shortHash(purchaseTx)}
          </a>
        )}
      </div>

      <Button
        type="button"
        onClick={onDone}
        className="min-h-[48px] w-full"
        data-testid="success-done-btn"
      >
        Done
      </Button>
    </div>
  );
}

function ErrorView({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4" data-testid="error-view">
      <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4">
        <XCircle className="mt-0.5 h-6 w-6 text-red-700" aria-hidden />
        <div>
          <h3 className="text-base font-semibold text-red-900">
            Purchase failed
          </h3>
          <p className="text-sm text-red-800" data-testid="error-message">
            {message}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={onRetry}
          className="min-h-[48px] flex-1"
          data-testid="error-retry-btn"
        >
          Try again
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="min-h-[48px]"
        >
          Close
        </Button>
      </div>
    </div>
  );
}
