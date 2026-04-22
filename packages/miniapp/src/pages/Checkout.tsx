import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { MobileLayout } from "@/components/layouts/MobileLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckoutStepIndicator } from "@/components/checkout/CheckoutStepIndicator";
import { CheckoutSummary } from "@/components/checkout/CheckoutSummary";
import { useCheckout } from "@/hooks/useCheckout";
import {
  useOrderInitiate,
  type OrderInitiateResponse,
} from "@/hooks/useOrderInitiate";
import { ApiError } from "@/lib/api";

export default function Checkout() {
  const navigate = useNavigate();
  const { productId } = useParams<{ productId: string }>();
  const init = useOrderInitiate(productId);
  const { state, run, reset } = useCheckout();

  const isInFlight =
    state.phase === "preparing" || state.phase === "confirming";

  // Redirect to /order/:id the moment the backend confirms the order.
  if (state.phase === "success") {
    return (
      <SuccessPage
        dbOrderId={state.dbOrderId}
        onView={() => navigate(`/order/${state.dbOrderId}`)}
      />
    );
  }

  return (
    <MobileLayout
      header={
        <div className="flex w-full items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            disabled={isInFlight}
          >
            Back
          </Button>
          <h1 className="flex-1 text-center text-base font-semibold">
            Checkout
          </h1>
          <span className="w-14" aria-hidden />
        </div>
      }
      bottomCta={
        <Bottom
          state={state}
          initiate={init.data}
          isInitLoading={init.isPending}
          initError={init.error}
          onConfirm={() => {
            if (productId && init.data) {
              run({ productId, initiate: init.data });
            }
          }}
          onRetry={reset}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {init.isPending ? (
          <SkeletonSummary />
        ) : init.isError ? (
          <InitiateErrorBlock error={init.error} />
        ) : init.data ? (
          <>
            <CheckoutSummary initiate={init.data} />
            {state.phase === "confirming" ? (
              <CheckoutStepIndicator
                current={state.stepNumber}
                total={state.totalSteps}
                needsApprove={state.totalSteps === 3}
                step={state.step}
              />
            ) : null}
            {state.phase === "error" ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                {state.error.message}
                {state.error.shortMessage ? (
                  <p className="mt-1 text-xs text-destructive/80">
                    {state.error.shortMessage}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </MobileLayout>
  );
}

function SkeletonSummary() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
}

function InitiateErrorBlock({ error }: { error: unknown }) {
  const detail =
    error instanceof ApiError
      ? ((error.body as { detail?: string } | null)?.detail ??
        "Can't start checkout.")
      : "Can't start checkout.";
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
      {detail}
    </div>
  );
}

function Bottom({
  state,
  initiate,
  isInitLoading,
  initError,
  onConfirm,
  onRetry,
}: {
  state: ReturnType<typeof useCheckout>["state"];
  initiate: OrderInitiateResponse | undefined;
  isInitLoading: boolean;
  initError: unknown;
  onConfirm: () => void;
  onRetry: () => void;
}) {
  if (isInitLoading || initError) return null;

  if (state.phase === "error") {
    return (
      <Button className="w-full" size="lg" onClick={onRetry}>
        Try again
      </Button>
    );
  }

  const busy =
    state.phase === "preparing" || state.phase === "confirming";
  return (
    <Button
      className="w-full"
      size="lg"
      onClick={onConfirm}
      disabled={busy || !initiate}
    >
      {busy ? "Processing…" : "Confirm order"}
    </Button>
  );
}

function SuccessPage({
  dbOrderId,
  onView,
}: {
  dbOrderId: string;
  onView: () => void;
}) {
  return (
    <MobileLayout
      bottomCta={
        <Button className="w-full" size="lg" onClick={onView}>
          View order
        </Button>
      }
    >
      <section className="flex flex-col items-center gap-4 pt-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-emerald-500"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            stroke="currentColor"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold">Payment received</h1>
        <p className="max-w-xs text-base text-muted-foreground">
          Your USDT is safe in escrow. The seller has been notified.
        </p>
        <p className="text-xs text-muted-foreground">
          Order #{dbOrderId.slice(0, 8)}
        </p>
      </section>
    </MobileLayout>
  );
}
