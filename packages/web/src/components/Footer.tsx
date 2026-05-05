import Link from "next/link";

/**
 * Footer — required by MiniPay submission (minipay-requirements.md
 * §4 : in-app Terms of Service + Privacy Policy + Support links
 * reachable from every Mini App route). Mounted in the root layout
 * so it renders on every public + MiniPay page.
 *
 * Server component — pure-static rendering, zero JS shipped, zero
 * runtime cost. Touch targets ≥44px (CLAUDE.md design standards),
 * body text ≥16px, WCAG AA contrast on celo-light + celo-dark-bg.
 *
 * Phase 5 polish residual / J11 audit pré-soumission.
 */
export function Footer() {
  return (
    <footer className="mt-12 border-t border-neutral-200 px-4 py-6 dark:border-celo-light/10">
      <nav
        aria-label="Footer"
        className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-base text-celo-dark/80 dark:text-celo-light/80 sm:flex-row sm:justify-center sm:gap-6"
      >
        <Link
          href="/legal/terms"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md px-4 hover:bg-celo-dark/5 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:hover:bg-celo-light/5 dark:focus-visible:ring-celo-forest-bright"
        >
          Terms
        </Link>
        <Link
          href="/legal/privacy"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md px-4 hover:bg-celo-dark/5 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:hover:bg-celo-light/5 dark:focus-visible:ring-celo-forest-bright"
        >
          Privacy
        </Link>
        <a
          href="mailto:support@etalo.app?subject=Etalo%20support"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md px-4 hover:bg-celo-dark/5 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:hover:bg-celo-light/5 dark:focus-visible:ring-celo-forest-bright"
        >
          Support
        </a>
      </nav>
    </footer>
  );
}
