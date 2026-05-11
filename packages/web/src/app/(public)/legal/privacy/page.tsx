import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Etalo Privacy Policy.",
};

export default function PrivacyPage() {
  return (
    <main
      id="main"
      className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6"
    >
      <h1 className="mb-6 text-3xl font-semibold">Privacy Policy</h1>

      <div className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 p-4 text-base text-yellow-900 dark:border-yellow-700/40 dark:bg-yellow-950/30 dark:text-yellow-100">
        <strong>Placeholder — to be reviewed by counsel before V1
        production launch.</strong> This page exists to satisfy the
        MiniPay submission requirement (in-app Privacy link reachable
        from every Mini App route). The text below is a scaffold,
        not the final binding policy.
      </div>

      <section className="space-y-4">
        <h2 className="mt-8 text-xl font-semibold">1. Données collectées</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          Etalo collects only data strictly necessary to operate the
          marketplace : seller shop handle, shop name, country, and
          product metadata (titles, descriptions, prices, images).
          Buyer wallet addresses are received as a header for backend
          operations but are never displayed publicly. No phone
          number, email, or government ID is collected by Etalo.
        </p>

        <h2 className="mt-8 text-xl font-semibold">2. Stockage</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          Seller profile data and product metadata are stored on a
          managed PostgreSQL database hosted in [region to be
          defined]. Off-chain order metadata (delivery proof
          references, dispute evidence file pointers) are stored in
          the same database. Access is restricted to the Etalo
          backend service and audited.
        </p>

        <h2 className="mt-8 text-xl font-semibold">3. Métadonnées IPFS</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          Product images and shop logos are stored on IPFS via the
          Pinata pinning service. IPFS content is public and content-
          addressed by hash ; once pinned it cannot be deleted, only
          unpinned. Sellers are advised not to upload personally
          identifying material in product images.
        </p>

        <h2 className="mt-8 text-xl font-semibold">4. Wallet address</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          Wallet addresses are public on-chain. Etalo associates
          wallet addresses with seller shop handles for routing and
          reputation tracking. Buyers&apos; wallet addresses are passed
          through the smart contract as part of the order record but
          are never rendered as the primary user identifier in the UI
          (per MiniPay submission requirements).
        </p>

        <h2 className="mt-8 text-xl font-semibold">5. Conservation</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          Active seller and product data is retained as long as the
          shop is active. Closed shops have a 90-day retention window
          after which off-chain data is anonymized. On-chain data
          (orders, escrow records) is permanent and cannot be
          deleted.
        </p>

        <h2 className="mt-8 text-xl font-semibold">6. Droits RGPD</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          For users in the European Union or jurisdictions with
          equivalent data protection regulations, Etalo provides
          right of access, rectification, and erasure for off-chain
          data (subject to the IPFS / on-chain immutability noted
          above). Contact via the support link to exercise these
          rights.
        </p>

        <h2 className="mt-8 text-xl font-semibold">7. Contact</h2>
        <p className="text-base text-neutral-700 dark:text-celo-light/80">
          For privacy questions or data requests, use the Support
          link in the page footer.
        </p>
      </section>
    </main>
  );
}
