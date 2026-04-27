"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

import { cn } from "@/components/ui/v4/utils";

/**
 * V4 Toast notifications (J9 Block 3 Chunk 3h).
 *
 * Wraps the `sonner` Toaster with V4 styling via `toastOptions.classNames`
 * + lucide icons coloured against the Celo palette. Light-mode only —
 * dark mode is deferred V1.5 per CLAUDE.md, so `next-themes` is
 * intentionally not wired here.
 *
 * Mount `<ToasterV4 />` once in the root layout. Any existing `toast()`
 * call (sonner global) automatically adopts V4 styles after the swap.
 */
export const ToasterV4 = ({ className, ...props }: ToasterProps) => (
  <Sonner
    className={cn("toaster group", className)}
    icons={{
      success: <CircleCheckIcon className="size-4 text-celo-forest" />,
      info: <InfoIcon className="size-4 text-celo-dark" />,
      warning: <TriangleAlertIcon className="size-4 text-celo-dark" />,
      error: <OctagonXIcon className="size-4 text-celo-red" />,
      loading: <Loader2Icon className="size-4 animate-spin text-celo-dark" />,
    }}
    toastOptions={{
      classNames: {
        toast: cn(
          "bg-celo-light text-celo-dark",
          "border border-celo-dark/[8%]",
          "rounded-2xl shadow-celo-md p-4",
          "font-sans",
        ),
        title: "font-display text-body font-medium",
        description: "text-body-sm opacity-60 mt-1",
        closeButton: cn(
          "rounded-full p-1 text-celo-dark",
          "hover:bg-celo-forest-soft",
          "border-0 bg-transparent",
        ),
        actionButton: cn(
          "bg-celo-forest text-celo-light",
          "rounded-pill px-3 py-1 text-overline",
        ),
        cancelButton: "text-celo-dark/60 hover:text-celo-dark",
      },
    }}
    {...props}
  />
);
ToasterV4.displayName = "ToasterV4";

/**
 * V4 toast helpers — identity-aliases of `sonner.toast.X` to give pages
 * a single, explicit V4 import surface. No behaviour override; the V4
 * appearance comes from `<ToasterV4>`'s toastOptions.
 */
export const toastV4 = {
  success: toast.success,
  error: toast.error,
  warning: toast.warning,
  info: toast.info,
  loading: toast.loading,
  promise: toast.promise,
  dismiss: toast.dismiss,
  default: toast,
};

// Re-export the raw sonner `toast` for callers that want the full API
// surface (toast.custom, toast.message, etc.) without going through the
// curated V4 namespace.
export { toast };
