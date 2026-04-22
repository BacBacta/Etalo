import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MobileLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  bottomCta?: ReactNode;
  className?: string;
}

/**
 * Mobile-first single-column layout for the Mini App.
 *
 * - Caps the content at max-w-md on wider screens so desktop-dev sees
 *   the same mobile proportions we target (MiniPay viewport 360x720).
 * - Header and bottomCta slots respect iOS/Android safe areas.
 * - Content scrolls; header and bottomCta stay pinned.
 */
export function MobileLayout({
  children,
  header,
  bottomCta,
  className,
}: MobileLayoutProps) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-background">
      {header ? (
        <header className="sticky top-0 z-10 border-b bg-background/95 pt-safe backdrop-blur">
          <div className="flex h-14 items-center px-4">{header}</div>
        </header>
      ) : null}

      <main className={cn("flex-1 overflow-y-auto px-4 py-4", className)}>
        {children}
      </main>

      {bottomCta ? (
        <footer className="sticky bottom-0 z-10 border-t bg-background/95 pb-safe backdrop-blur">
          <div className="px-4 py-3">{bottomCta}</div>
        </footer>
      ) : null}
    </div>
  );
}
