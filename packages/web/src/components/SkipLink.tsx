/**
 * SkipLink — WCAG 2.4.1 Bypass Blocks (Level A) compliance for keyboard
 * navigation. Rendered at the top of <body> in app/layout.tsx, this
 * link is invisible by default (`sr-only`) and reveals itself only when
 * a keyboard user reaches it via Tab (`focus:not-sr-only` + visual
 * focus styling). Activating the link jumps focus to `#main`, which
 * each page's primary <main> element exposes — keyboard users can
 * bypass the persistent PublicHeader navigation and land directly on
 * page content.
 *
 * Phase 5 Angle E sub-block E.1.a — extracted from inline JSX in
 * RootLayout for a clean unit test surface (jsdom can't host
 * <html>/<body> without warnings, so a dedicated component keeps the
 * Vitest contract pin local). z-50 keeps the link above any sticky
 * header when activated.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      data-testid="skip-link"
      className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-celo-dark focus:px-4 focus:py-2 focus:text-celo-light focus:outline-none focus:ring-2 focus:ring-celo-forest focus:ring-offset-2 dark:focus:bg-celo-light dark:focus:text-celo-dark dark:focus:ring-celo-forest-bright"
    >
      Skip to main content
    </a>
  );
}
