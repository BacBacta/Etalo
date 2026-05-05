"use client";

import { useState } from "react";
import { ChatCircle, Copy } from "@phosphor-icons/react";

interface ShareButtonsProps {
  url: string;
  title: string;
}

// J10-V5 Phase 5 Angle B Track 2 fix #3 — pre-fix : `bg-white` +
// `border-neutral-300` rendered the buttons as bright pills on the
// dark celo-dark-bg page → low contrast, button labels disappeared
// against the white surface in dark mode. Add explicit dark: variants
// to keep the buttons visible in both themes (mirror the V4 outline
// pattern from ButtonV4).
const OUTLINE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-base font-medium text-celo-dark hover:bg-neutral-50 dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light dark:hover:bg-celo-light/10";

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked inside some WebViews — silent fail
      // is acceptable here; the WhatsApp button still works.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Share</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className={OUTLINE}
        >
          <ChatCircle className="h-4 w-4" /> WhatsApp
        </a>
        <button type="button" onClick={copy} className={OUTLINE}>
          <Copy className="h-4 w-4" />
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
      <p className="text-sm text-neutral-500">
        Paste the link in your Instagram story or TikTok bio.
      </p>
    </div>
  );
}
