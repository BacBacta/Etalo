"use client";

// Root-level Error Boundary for the Next.js App Router.
// CLAUDE.md design standards: no white screen on async failure —
// surface a user-friendly fallback with retry.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
