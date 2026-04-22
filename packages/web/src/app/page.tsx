const MINIAPP_URL =
  process.env.NEXT_PUBLIC_MINIAPP_URL ?? "http://localhost:5173";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Etalo
        </h1>
        <p className="max-w-md text-lg text-neutral-600">
          Your digital stall, open 24/7.
        </p>
      </header>
      <p className="max-w-md text-base text-neutral-600">
        A non-custodial social commerce platform for African sellers.
        Secure payments, buyer protection, no middleman.
      </p>
      <a
        href={MINIAPP_URL}
        className="inline-flex h-12 items-center justify-center rounded-md bg-neutral-900 px-8 text-base font-medium text-white hover:bg-neutral-800"
      >
        Open in MiniPay
      </a>
    </main>
  );
}
