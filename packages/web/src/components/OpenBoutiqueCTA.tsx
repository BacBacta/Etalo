/**
 * OpenBoutiqueCTA — web-surface "Open my boutique" CTA.
 *
 * Mirrors the HomeMiniPay seller CTA visually but routes web visitors
 * (no MiniPay) to a modal explaining MiniPay is required to manage a
 * boutique, with Get-MiniPay store fallbacks. Sellers reading on
 * desktop scan the QR-equivalent flow via the store links — no QR
 * here because the seller flow needs a wallet, which only exists in
 * the MiniPay app context (no point QR-launching a checkout token).
 *
 * Inside MiniPay, HomeRouter swaps to HomeMiniPay before this surface
 * mounts, so this component never renders for MiniPay users — the
 * modal contents focus solely on the web → install funnel.
 */
"use client";

import { useState } from "react";

import { SECONDARY_CTA_CLASSES } from "@/components/home-cta-styles";
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
        className={SECONDARY_CTA_CLASSES}
      >
        Open my boutique
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open your boutique in MiniPay</DialogTitle>
            <DialogDescription>
              MiniPay handles your wallet, payments, and seller orders.
              Install MiniPay to start your digital stall — Etalo opens
              automatically inside the app.
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
