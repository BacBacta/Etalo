"use client";

import { useState } from "react";
import { ChatCircle, Copy } from "@phosphor-icons/react";

interface ShareButtonsProps {
  url: string;
  title: string;
}

const OUTLINE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-base font-medium hover:bg-neutral-50";

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
