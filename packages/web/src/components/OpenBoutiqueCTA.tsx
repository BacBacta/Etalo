/**
 * OpenBoutiqueCTA — web-surface "Open in MiniPay" CTA (ADR-051 V1
 * funnel scope).
 *
 * Promoted from secondary to PRIMARY — post-ADR-049 (asset gen
 * deferral) the marketing pack-driven inbound is gone, so the public
 * funnel's job is to convert browse-on-web visitors into MiniPay
 * users. This is THE primary CTA on the landing.
 *
 * Behavior :
 * - Click on web (no MiniPay context) → modal with Get MiniPay store
 *   links (Play / App Store). Sellers AND buyers go through the same
 *   path — install MiniPay first, then the next visit to etalo.app
 *   inside MiniPay routes to /marketplace via HomeRouter.
 * - Click in MiniPay (shouldn't happen — HomeRouter redirects MiniPay
 *   visitors to /marketplace before this CTA renders) — opens the
 *   same modal, harmless fallback.
 */
"use client";

import { useState } from "react";

import { PRIMARY_CTA_CLASSES } from "@/components/home-cta-styles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.opera.mini.native";
const APP_STORE_URL = "https://apps.apple.com/app/minipay/id6463420669";

export function OpenBoutiqueCTA() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="landing-open-boutique"
        className={PRIMARY_CTA_CLASSES}
      >
        Open in MiniPay
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open Etalo in MiniPay</DialogTitle>
            <DialogDescription>
              Etalo runs inside MiniPay — your wallet, payments, and
              orders all live there. Install MiniPay (free) and open
              etalo.app from inside the app to browse the marketplace
              and pay with USDT escrow.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-md bg-black px-6 py-3 text-base font-medium text-white"
              data-testid="landing-open-boutique-play-store"
            >
              Get on Play Store
            </a>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-md bg-black px-6 py-3 text-base font-medium text-white"
              data-testid="landing-open-boutique-app-store"
            >
              Get on App Store
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
