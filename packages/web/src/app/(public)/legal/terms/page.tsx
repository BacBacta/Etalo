import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms governing your use of the Etalo non-custodial marketplace, under Belgian and EU law.",
};

const LAST_UPDATED = "14 June 2026";
const SUPPORT_EMAIL = "support@etalo.xyz";

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

export default function TermsPage() {
  return (
    <main id="main" className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-3xl font-semibold text-celo-dark dark:text-celo-light">
        Terms of Service
      </h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-celo-light/60">
        Last updated: {LAST_UPDATED}
      </p>

      <p className="text-base leading-relaxed text-neutral-700 dark:text-celo-light/80">
        These Terms govern your use of Etalo, a non-custodial marketplace
        available at etalo.xyz and inside MiniPay. By using Etalo you agree to
        these Terms. Please read them together with our{" "}
        <a
          href="/legal/privacy"
          className="text-celo-forest underline dark:text-celo-forest-bright"
        >
          Privacy Policy
        </a>
        .
      </p>

      <Section n="1" title="Who we are">
        <p>
          Etalo (the &ldquo;Platform&rdquo;) is operated from Belgium. You can
          reach us at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-celo-forest underline dark:text-celo-forest-bright"
          >
            {SUPPORT_EMAIL}
          </a>
          . The operator&rsquo;s registered legal entity name, company number,
          and registered address will be stated here once incorporation is
          finalised; until then, the operator acts as the controller and contact
          point above.
        </p>
      </Section>

      <Section n="2" title="What Etalo is — and is not">
        <p>
          Etalo provides the technology that connects buyers and sellers and
          runs payments through audited smart contracts on the Celo blockchain.
          The sale contract is concluded <strong>directly between the buyer and
          the seller</strong>; Etalo is an intermediary and is not a party to
          that contract, not the seller, and not a custodian of funds.
        </p>
        <p>
          Etalo is <strong>non-custodial</strong>: your funds are held by smart
          contracts, not by us. We cannot access, move, freeze, or reverse your
          funds outside the rules coded into those contracts.
        </p>
      </Section>

      <Section n="3" title="Eligibility">
        <p>
          You must be at least 18 and able to enter a binding contract. In this
          first version, Etalo supports intra-Africa trade only, with launch
          markets in Nigeria, Ghana, and Kenya; buyers and sellers transact
          within these markets.
        </p>
      </Section>

      <Section n="4" title="Payments, fees, and escrow">
        <p>
          Payments are made in USDT (a digital-dollar stablecoin) on Celo. When
          a buyer pays, the amount is locked in an escrow smart contract. The
          network fee is handled in USDT through MiniPay — you do not need any
          other token.
        </p>
        <p>
          Etalo charges sellers a single commission of <strong>1.8%</strong> of
          the order value (V1, intra-Africa), deducted automatically on-chain at
          release. The commission, the seller payout, and the release schedule
          are enforced by the smart contracts.
        </p>
        <p>
          <strong>On-chain transactions are irreversible.</strong> Once
          confirmed, a blockchain transaction cannot be undone. Buyer protection
          is provided through escrow, auto-refund, and the dispute process
          described below — not by chargebacks.
        </p>
      </Section>

      <Section n="5" title="Buyer protection — escrow and delivery">
        <p>
          Funds stay in escrow until the buyer confirms delivery, or until an
          automatic release timer elapses after the item is marked delivered. If
          a seller does not ship within the published seller-inactivity window,
          the buyer can reclaim a refund directly from the order page — no
          intervention from us is required.
        </p>
      </Section>

      <Section n="6" title="Disputes">
        <p>
          If something goes wrong, the dispute process has three levels: (N1) an
          amicable resolution proposed between buyer and seller; (N2) mediation
          by an Etalo-approved mediator who reviews the evidence; and (N3) a
          community vote where applicable. Outcomes are enforced on-chain by the
          dispute contract. Deadlines and details are surfaced in the app on each
          order.
        </p>
      </Section>

      <Section n="7" title="Your statutory rights">
        <p>
          Nothing in these Terms limits any mandatory consumer-protection rights
          you have under the law applicable to you. Where EU consumer law
          applies, you keep your statutory rights, including any right of
          withdrawal and legal guarantees of conformity. Because items ship
          physically between buyer and seller, returns and refunds are handled
          through the order, refund, and dispute mechanisms above.
        </p>
      </Section>

      <Section n="8" title="Seller obligations">
        <p>As a seller, you agree to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>list only goods you are legally allowed to sell;</li>
          <li>describe products accurately, including price and stock;</li>
          <li>
            ship promptly within the published windows and provide truthful
            shipping information;
          </li>
          <li>
            respect intellectual-property and consumer-protection laws, and
            handle buyer delivery data only to fulfil the order.
          </li>
        </ul>
      </Section>

      <Section n="9" title="Prohibited use">
        <p>You must not use Etalo to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            list or trade illegal, counterfeit, stolen, or restricted goods;
          </li>
          <li>commit fraud, launder money, or finance illegal activity;</li>
          <li>infringe others&rsquo; rights or upload unlawful content;</li>
          <li>
            attempt to attack, manipulate, or circumvent the smart contracts or
            the Platform.
          </li>
        </ul>
      </Section>

      <Section n="10" title="Intellectual property">
        <p>
          The Etalo name, logo, and software are ours or our licensors&rsquo;. By
          uploading content (e.g. product photos, shop details) you grant Etalo a
          non-exclusive licence to host and display it for the purpose of running
          the marketplace. You keep ownership of your content.
        </p>
      </Section>

      <Section n="11" title="Disclaimers and liability">
        <p>
          The Platform is provided &ldquo;as is&rdquo;. Etalo is not responsible
          for the quality, legality, safety, or delivery of items sold by
          sellers, nor for losses arising from blockchain risks (e.g. wallet
          compromise, lost keys, network conditions, or smart-contract behaviour
          beyond our control). To the maximum extent permitted by law, Etalo is
          not liable for indirect or consequential damages. Nothing here excludes
          liability that cannot be excluded by law, including for fraud or for
          death or personal injury caused by negligence.
        </p>
      </Section>

      <Section n="12" title="Suspension and termination">
        <p>
          We may suspend or remove accounts or listings that breach these Terms
          or applicable law. You can stop using Etalo at any time; funds already
          in escrow continue to follow the contract rules until the relevant
          order completes, refunds, or resolves.
        </p>
      </Section>

      <Section n="13" title="Applicable law and disputes with Etalo">
        <p>
          Because our operator is established in Belgium, these Terms are
          governed by Belgian and EU law. However, this never overrides the
          <strong> mandatory consumer-protection and data-protection rules of
          your own country</strong> — in our launch markets, that includes
          Nigeria (the Federal Competition and Consumer Protection Act and the
          Nigeria Data Protection Act 2023), Ghana (consumer and electronic
          transactions law and the Data Protection Act 2012), and Kenya (the
          Consumer Protection Act 2012 and the Data Protection Act 2019). You
          keep every right those laws give you, and you may bring proceedings and
          complain to the authorities of your country.
        </p>
        <p>
          EU-based users may also use the European Commission&rsquo;s Online
          Dispute Resolution platform at{" "}
          <a
            href="https://ec.europa.eu/consumers/odr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-celo-forest underline dark:text-celo-forest-bright"
          >
            ec.europa.eu/consumers/odr
          </a>
          .
        </p>
      </Section>

      <Section n="14" title="Changes">
        <p>
          We may update these Terms; the &ldquo;Last updated&rdquo; date above
          will change and we will surface material changes in the app. Questions?
          Email{" "}
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
