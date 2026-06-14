import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Etalo collects, uses, and protects personal data, in line with the EU General Data Protection Regulation (GDPR).",
};

const LAST_UPDATED = "14 June 2026";
const SUPPORT_EMAIL = "support@etalo.app";

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xl font-semibold text-celo-dark dark:text-celo-light">
        {n}. {title}
      </h2>
      <div className="space-y-3 text-base leading-relaxed text-neutral-700 dark:text-celo-light/80">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-3xl font-semibold text-celo-dark dark:text-celo-light">
        Privacy Policy
      </h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-celo-light/60">
        Last updated: {LAST_UPDATED}
      </p>

      <p className="text-base leading-relaxed text-neutral-700 dark:text-celo-light/80">
        This Privacy Policy explains how Etalo (&ldquo;Etalo&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;) processes personal data when you use
        the Etalo marketplace at etalo.xyz and inside MiniPay. We follow the EU
        General Data Protection Regulation (GDPR). Etalo is a{" "}
        <strong>non-custodial</strong> platform: payments are held by audited
        smart contracts on the Celo blockchain, never by us.
      </p>

      <Section n="1" title="Who is responsible (data controller)">
        <p>
          The data controller is Etalo, operated from Belgium. For any privacy
          request, contact us at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-celo-forest underline dark:text-celo-forest-bright"
          >
            {SUPPORT_EMAIL}
          </a>
          . The registered legal entity and address are set out in{" "}
          <a
            href="/legal/terms"
            className="text-celo-forest underline dark:text-celo-forest-bright"
          >
            our Terms of Service
          </a>
          .
        </p>
      </Section>

      <Section n="2" title="What data we collect">
        <p>We collect only what is needed to run the marketplace:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Wallet address</strong> — the public Celo address you
            connect with, used to identify your account, route orders, and track
            seller reputation.
          </li>
          <li>
            <strong>Seller profile</strong> (if you sell) — shop name, shop
            handle, country, description, logo, and any social links you add
            (Instagram, TikTok, and a WhatsApp number used for order
            notifications).
          </li>
          <li>
            <strong>Product listings</strong> — titles, descriptions, prices,
            stock, and photos you upload.
          </li>
          <li>
            <strong>Delivery details</strong> (when you buy) — recipient name,
            phone number, country, city, neighbourhood/area, and address,
            captured at checkout so the seller can ship to you.
          </li>
          <li>
            <strong>Dispute information</strong> — messages and evidence you
            submit if you open or respond to a dispute.
          </li>
          <li>
            <strong>Technical data</strong> — IP address and basic request
            metadata in our hosting logs, and your device/wallet type, used for
            security and reliability.
          </li>
          <li>
            <strong>Local device storage</strong> — your cart, theme, and
            notification &ldquo;last seen&rdquo; markers are kept in your
            browser&rsquo;s local storage. We do not use advertising or tracking
            cookies.
          </li>
        </ul>
      </Section>

      <Section n="3" title="Why we use it and our legal bases">
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>To perform our contract with you</strong> (GDPR Art.
            6(1)(b)) — create your account, list products, process orders and
            escrow, enable delivery, and handle disputes.
          </li>
          <li>
            <strong>Our legitimate interests</strong> (Art. 6(1)(f)) — prevent
            fraud and abuse, keep the service secure, maintain seller reputation,
            and send transactional notifications.
          </li>
          <li>
            <strong>Your consent</strong> (Art. 6(1)(a)) — where you choose to
            add optional details such as social links, which you can remove at
            any time.
          </li>
          <li>
            <strong>Legal obligations</strong> (Art. 6(1)(c)) — where we must
            retain records to comply with applicable law.
          </li>
        </ul>
      </Section>

      <Section n="4" title="Blockchain data is public and permanent">
        <p>
          Some information is recorded on the Celo public blockchain by the smart
          contracts — including wallet addresses, order amounts, commission,
          order status, and dispute records. Blockchain data is{" "}
          <strong>public, decentralised, and immutable</strong>: it cannot be
          changed or deleted by us or anyone else. Please keep this in mind
          before transacting. We never publish your delivery address, phone
          number, or name on-chain.
        </p>
      </Section>

      <Section n="5" title="Who we share data with (processors)">
        <p>
          We do not sell your data. We share it only with service providers that
          process it on our behalf, under contract:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Pinata</strong> — stores product images and logos on IPFS.
            IPFS content is public and content-addressed; once pinned it can be
            unpinned but is not guaranteed to be erased. Do not put identifying
            information in product photos.
          </li>
          <li>
            <strong>Twilio</strong> — sends WhatsApp order notifications to the
            seller&rsquo;s WhatsApp number and the buyer&rsquo;s delivery phone.
          </li>
          <li>
            <strong>Vercel</strong> — hosts and serves the web app.
          </li>
          <li>
            <strong>Fly.io</strong> — hosts our backend service and PostgreSQL
            database (off-chain profile, product, order, and dispute metadata).
          </li>
          <li>
            <strong>The Celo network</strong> — a public blockchain that records
            on-chain transactions (see section 4).
          </li>
        </ul>
      </Section>

      <Section n="6" title="International transfers">
        <p>
          Some of our processors are located outside the European Economic Area
          (for example in the United States, and our backend region is in
          Africa). Where data is transferred outside the EEA, we rely on
          appropriate safeguards such as the European Commission&rsquo;s Standard
          Contractual Clauses or an adequacy decision. Blockchain data is, by
          design, replicated globally across public nodes.
        </p>
      </Section>

      <Section n="7" title="How long we keep it">
        <p>
          Off-chain account and listing data is kept while your account is active
          and for as long as needed to provide the service. Order and dispute
          records are retained for the period required to resolve disputes and
          meet legal and accounting obligations, then deleted or anonymised.
          On-chain data is permanent and outside our control.
        </p>
      </Section>

      <Section n="8" title="Your rights">
        <p>Under the GDPR you have the right to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>access the personal data we hold about you;</li>
          <li>have inaccurate data corrected;</li>
          <li>
            have your data erased — note that data already written to the public
            blockchain cannot be deleted (section 4);
          </li>
          <li>restrict or object to certain processing;</li>
          <li>receive your data in a portable format;</li>
          <li>
            withdraw consent at any time, without affecting prior processing.
          </li>
        </ul>
        <p>
          To exercise any right, email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-celo-forest underline dark:text-celo-forest-bright"
          >
            {SUPPORT_EMAIL}
          </a>
          . You also have the right to lodge a complaint with a supervisory
          authority — in Belgium, the Data Protection Authority (Autorité de
          protection des données / Gegevensbeschermingsautoriteit), Rue de la
          Presse 35, 1000 Brussels,{" "}
          <a
            href="https://www.dataprotectionauthority.be"
            target="_blank"
            rel="noopener noreferrer"
            className="text-celo-forest underline dark:text-celo-forest-bright"
          >
            dataprotectionauthority.be
          </a>
          .
        </p>
      </Section>

      <Section n="9" title="Security">
        <p>
          We use encryption in transit (HTTPS), access controls on our database,
          and a least-privilege backend. No system is perfectly secure; you are
          responsible for safeguarding your wallet and its keys, which Etalo
          never holds.
        </p>
      </Section>

      <Section n="10" title="Children">
        <p>
          Etalo is not intended for anyone under 18, and we do not knowingly
          collect data from children.
        </p>
      </Section>

      <Section n="11" title="Changes to this policy">
        <p>
          We may update this policy; the &ldquo;Last updated&rdquo; date above
          will change and, for material changes, we will surface a notice in the
          app. Questions? Email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-celo-forest underline dark:text-celo-forest-bright"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
