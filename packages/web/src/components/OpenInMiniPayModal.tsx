"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import type { ResolvedCart } from "@/lib/checkout";

interface Props {
  token: string;
  cart: ResolvedCart;
}

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.opera.mini.native";
const APP_STORE_URL = "https://apps.apple.com/app/minipay/id6463420669";

export function OpenInMiniPayModal({ token, cart }: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  const checkoutUrl = `${BASE_URL}/checkout?token=${encodeURIComponent(token)}`;
  // TODO J11 pre-submission: verify the canonical MiniPay deeplink format
  // against docs.minipay.xyz/deeplinks. The form below is a reasonable
  // universal-link stub (Opera MiniPay app + url= param) — to be confirmed.
  const minipayDeeplink = `https://minipay.opera.com/?app=etalo&url=${encodeURIComponent(checkoutUrl)}`;

  const sellerLabel = cart.groups.length === 1 ? "seller" : "sellers";

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h1 className="mb-2 text-xl font-semibold">Complete in MiniPay</h1>
        <p className="mb-4 text-base text-neutral-700">
          MiniPay protects your purchase with USDT escrow.{" "}
          {isMobile
            ? "Open MiniPay on this device to complete your order."
            : "Scan this code with your phone to continue in MiniPay."}
        </p>

        {!isMobile ? (
          <div className="my-6 flex justify-center">
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <QRCodeSVG value={checkoutUrl} size={200} level="M" />
            </div>
          </div>
        ) : null}

        {isMobile ? (
          <a
            href={minipayDeeplink}
            className="block min-h-[44px] w-full rounded-md bg-black py-3 text-center text-base font-medium text-white"
          >
            Open MiniPay
          </a>
        ) : null}

        <div className="mt-6 border-t border-neutral-200 pt-6 text-center">
          <p className="mb-3 text-sm text-neutral-600">
            Don&apos;t have MiniPay yet?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-4">
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] items-center justify-center text-sm underline"
            >
              Get on Play Store
            </a>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] items-center justify-center text-sm underline"
            >
              Get on App Store
            </a>
          </div>
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-4 text-center text-sm text-neutral-600">
          <p className="tabular-nums">
            Total: {cart.total_usdt} USDT · {cart.groups.length} {sellerLabel}
          </p>
          <p className="mt-1 text-sm">
            Cart link expires {new Date(cart.expires_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
