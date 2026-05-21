"use client";

import { useEffect } from "react";

// Root-level Error Boundary for the Next.js App Router.
// CLAUDE.md design standards: no white screen on async failure —
// surface a user-friendly fallback with retry.
//
// "User rejected" handling : when a wagmi-driven page (any /(app)
// route — marketplace, checkout, seller dashboard…) auto-reconnects
// on mount and the user rejects the wallet popup, wagmi propagates
// the rejection synchronously and React Error Boundary catches it.
// That used to surface "Something went wrong" — confusing because
// the user JUST chose to say no, nothing is actually broken. We
// detect that case and auto-reset the boundary so the page renders
// as if no auto-reconnect was attempted ; the user can still tap
// "Connect" explicitly when they're ready.
function isWalletRejection(err: unknown): boolean {
  if (!err) return false;
  const message =
    (err as { message?: unknown }).message ?? String(err);
  const text = typeof message === "string" ? message : String(message);
  return /user (rejected|denied)/i.test(text);
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Auto-recover from wallet rejections. The reset() call re-renders
  // the route subtree ; since the rejection was a one-shot user
  // action, the second render won't re-trigger the auto-reconnect
  // path that threw, and the page lands normally.
  useEffect(() => {
    if (isWalletRejection(error)) {
      reset();
    }
  }, [error, reset]);

  if (isWalletRejection(error)) {
    // Render nothing during the brief moment between mount and the
    // useEffect-driven reset — prevents the "Something went wrong"
    // flash for a user who just clicked Reject on a wallet popup.
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="mb-4 text-xl font-semibold">Something went wrong</h2>
        <p className="mb-6 text-base text-neutral-600">
          We couldn&apos;t load this page. Please try again in a moment.
        </p>
        <button
          onClick={reset}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-neutral-300 px-6 text-base font-medium hover:bg-neutral-50"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
