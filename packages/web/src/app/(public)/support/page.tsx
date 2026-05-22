import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with Etalo — common issues, response time, and how to reach us.",
};

const SUPPORT_EMAIL = "support@etalo.app";

// Pre-filled subject + body. Helps users (and us) by funnelling all
// emails into a predictable shape — order/wallet/device up front, so
// triage doesn't need a round-trip clarification.
const MAILTO_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "Etalo support",
)}&body=${encodeURIComponent(
  [
    "Briefly describe the issue:",
    "",
    "If it relates to an order, include:",
    "- Order ID (visible in /orders):",
    "- Wallet address (first 6 + last 4 chars):",
    "- Device + wallet (MiniPay / MetaMask / etc.):",
    "",
    "Thank you.",
  ].join("\n"),
)}`;

interface FaqItem {
  question: string;
  answer: string;
}

const BUYER_FAQ: FaqItem[] = [
  {
    question: "My payment went through but the order is not showing up.",
    answer:
      "On-chain confirmation takes a few seconds. Refresh /orders after 30 seconds. If it is still missing after 5 minutes, contact support with the wallet address and the transaction hash from your wallet history.",
  },
  {
    question: "The seller has not shipped my item — what happens?",
    answer:
      "Funds are held in escrow, not by the seller and not by Etalo. If a seller does not act within the 7-day seller-inactivity window, you can claim a refund directly from the order page without our intervention.",
  },
  {
    question: "I confirmed delivery by mistake.",
    answer:
      "Confirming delivery releases escrow funds to the seller and cannot be undone. If the item is defective or wrong, contact the seller first ; if unresolved, open a dispute from the order page — the dispute process can request a partial refund.",
  },
  {
    question: "I do not see USDT in my wallet for the gas fee.",
    answer:
      "Etalo uses MiniPay fee abstraction — gas is paid in USDT, not CELO. If your USDT balance is too low for the transaction, the Start checkout button will guide you to the MiniPay Add Cash flow.",
  },
];

const SELLER_FAQ: FaqItem[] = [
  {
    question: "How fast do I get paid after shipping?",
    answer:
      "Once you mark an order as shipped and the buyer confirms delivery (or the 3-day auto-release window elapses), funds are released automatically by the escrow contract minus the 1.8% platform commission.",
  },
  {
    question: "A buyer opened a dispute — what do I do?",
    answer:
      "Respond in the dispute thread within 72 hours with shipping proof (tracking number, photo). N1 amicable resolution is preferred ; if it escalates, an Etalo mediator (N2) reviews the evidence. Dispute outcomes are enforced on-chain by the EtaloDispute contract.",
  },
  {
    question: "Can I delete a product that has open orders?",
    answer:
      "Products with active escrow orders cannot be deleted until those orders complete or refund. You can mark a product out of stock from the seller dashboard ; new buyers cannot purchase it but in-flight orders complete normally.",
  },
  {
    question: "How do I change my shop country?",
    answer:
      "Country is set on first profile creation and currently requires support intervention to change (to prevent cross-border abuse of intra-Africa-only V1 escrow). Contact us with your wallet address and the new country.",
  },
];

function FaqList({ title, items }: { title: string; items: FaqItem[] }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold text-celo-dark dark:text-celo-light">
        {title}
      </h2>
      <div className="space-y-4">
        {items.map((item) => (
          <details
            key={item.question}
            className="group rounded-lg border border-neutral-200 bg-white p-4 dark:border-celo-light/10 dark:bg-celo-dark-elevated"
          >
            <summary className="cursor-pointer list-none text-base font-medium text-celo-dark marker:hidden dark:text-celo-light">
              <span className="mr-2 inline-block transition-transform group-open:rotate-90">
                ▸
              </span>
              {item.question}
            </summary>
            <p className="mt-3 pl-6 text-base text-neutral-700 dark:text-celo-light/80">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function SupportPage() {
  return (
    <main
      id="main"
      className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6"
    >
      <h1 className="mb-3 text-3xl font-semibold text-celo-dark dark:text-celo-light">
        Support
      </h1>
      <p className="mb-8 text-base text-neutral-600 dark:text-celo-light/70">
        Most issues resolve themselves on-chain. The FAQ below covers
        the common ones. For anything else, email us — we reply within
        24 hours.
      </p>

      <div className="rounded-lg border border-celo-forest/30 bg-celo-forest/5 p-5 dark:border-celo-forest-bright/30 dark:bg-celo-forest-bright/10">
        <p className="mb-4 text-base text-celo-dark dark:text-celo-light">
          <strong>Email:</strong>{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-celo-forest underline hover:no-underline dark:text-celo-forest-bright"
          >
            {SUPPORT_EMAIL}
          </a>
          <br />
          <strong>Response time:</strong> within 24 hours, every day.
        </p>
        <a
          href={MAILTO_HREF}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-celo-forest px-5 text-base font-medium text-white hover:bg-celo-forest/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 dark:bg-celo-forest-bright dark:text-celo-dark dark:hover:bg-celo-forest-bright/90"
          data-testid="support-email-cta"
        >
          Email support
        </a>
      </div>

      <FaqList title="For buyers" items={BUYER_FAQ} />
      <FaqList title="For sellers" items={SELLER_FAQ} />

      <p className="mt-10 text-center text-sm text-neutral-500 dark:text-celo-light/50">
        Etalo is a non-custodial marketplace — funds live in audited
        smart contracts on Celo, not in our accounts. We can help with
        UX, account, and dispute mediation issues, but we cannot
        access or move your funds.
      </p>
    </main>
  );
}
