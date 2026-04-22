import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="max-w-md text-base text-neutral-600">
        The shop or product you are looking for doesn&apos;t exist, or was
        removed.
      </p>
      <Link
        href="/"
        className="inline-flex h-11 items-center justify-center rounded-md border border-neutral-300 px-6 text-base font-medium hover:bg-neutral-50"
      >
        Back to Etalo
      </Link>
    </main>
  );
}
