import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Etalo Terms of Service.",
};

export default function TermsPage() {
  return (
    <main
      id="main"
      className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6"
    >
      <h1 className="mb-6 text-3xl font-semibold">Terms of Service</h1>

      <div className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 p-4 text-base text-yellow-900 dark:border-yellow-700/40 dark:bg-yellow-950/30 dark:text-yellow-100">
        <strong>Placeholder — to be reviewed by counsel before V1
        production launch.</strong> This page exists to satisfy the
        MiniPay submission requirement (in-app Terms link reachable
        from every Mini App route). The legal text below is a
        scaffold, not the final binding document.
      </div>

      <section className="space-y-4">
        <h2 className="mt-8 text-xl font-semibold">1. Identité</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          Etalo is operated by [legal entity name to be defined],
          registered at [address]. Contact via the support link in
          the footer.
        </p>

        <h2 className="mt-8 text-xl font-semibold">2. Service</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          Etalo provides a non-custodial social commerce platform
          where sellers list products and buyers pay with USDT
          stablecoin via on-chain escrow on Celo. Funds are held by
          smart contracts, not by Etalo. Buyers are protected by
          escrow auto-refund if items do not ship within the
          published deadlines.
        </p>

        <h2 className="mt-8 text-xl font-semibold">3. Paiement</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          Payments use USDT digital dollar on Celo. Network fees are
          paid by buyers via MiniPay&apos;s fee abstraction. The
          commission rate is 1.8% (V1, intra-Africa). The
          commission, the seller payout, and the auto-release
          schedule are enforced on-chain by audited smart contracts
          (see Smart contract spec in repo).
        </p>

        <h2 className="mt-8 text-xl font-semibold">4. Litiges</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          Disputes follow the three-level path : amicable resolution
          between buyer and seller (N1), platform mediation (N2), and
          community jury (N3). All disputes are resolved on-chain via
          the EtaloDispute contract. See repo documentation for the
          full procedure and timelines.
        </p>

        <h2 className="mt-8 text-xl font-semibold">5. Loi applicable</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          [Jurisdiction to be defined by counsel. Likely options :
          seller&apos;s country of residence for B2C disputes, or a
          neutral arbitration framework for cross-seller cases.]
        </p>

        <h2 className="mt-8 text-xl font-semibold">6. Contact</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          For questions about these terms, use the Support link in
          the page footer.
        </p>
      </section>
    </main>
  );
}
