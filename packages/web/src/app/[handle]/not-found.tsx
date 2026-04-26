import Link from "next/link";

export default function ShopNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="mb-4 text-xl font-semibold">Shop not found</h2>
        <p className="mb-6 text-base text-neutral-600">
          This Etalo shop doesn&apos;t exist or hasn&apos;t been created yet.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-neutral-300 px-6 text-base font-medium hover:bg-neutral-50"
        >
          Browse Etalo
        </Link>
      </div>
    </main>
  );
}
