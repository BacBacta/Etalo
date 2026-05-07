/**
 * CountryPromptBanner — Sprint J11.7 Block 5 (ADR-045).
 *
 * Inline non-blocking banner that surfaces on the marketplace (and
 * any other surface that wants to nudge the buyer to declare their
 * country). Used when the connected wallet has no country in the
 * User row yet — the dropdown filter on Block 9 needs this to default
 * to the buyer's market.
 *
 * Behaviors :
 *  - Hidden if the buyer has a country already (parent gates rendering)
 *  - Hidden if no wallet connected (parent gates via useAccount)
 *  - Click-and-go : dropdown + "Save" CTA. Toast on success/error.
 *
 * Style : matches V5 design tokens (forest accent, pill button, 44px
 * touch targets) without pulling V5 ButtonV4 (Lesson #80 — keeps the
 * marketplace bundle frugal).
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  CountrySelector,
  type CountryCode,
} from "@/components/CountrySelector";
import { useSetMyCountry } from "@/hooks/useBuyerCountry";

const SAVE_CLASSES = [
  "inline-flex items-center justify-center",
  "h-11 px-5 min-w-[120px]",
  "font-sans font-medium text-base",
  "rounded-pill whitespace-nowrap",
  "bg-celo-forest text-celo-light hover:bg-celo-forest-dark",
  "dark:bg-celo-green dark:text-celo-dark dark:hover:bg-celo-green-hover",
  "transition-colors duration-200 ease-out",
  "outline-none disabled:opacity-50 disabled:cursor-not-allowed",
  "focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2",
].join(" ");

export interface CountryPromptBannerProps {
  /** Connected wallet address ; required to enable mutation. */
  wallet: string;
  /** Optional callback after a successful save (e.g. parent refetches). */
  onSaved?: (country: CountryCode) => void;
  className?: string;
}

export function CountryPromptBanner({
  wallet,
  onSaved,
  className,
}: CountryPromptBannerProps) {
  const [country, setCountry] = useState<CountryCode | null>(null);
  const { mutate, isPending } = useSetMyCountry({ wallet });

  const handleSave = () => {
    if (!country) {
      toast.error("Please pick a country first.");
      return;
    }
    mutate(
      { country },
      {
        onSuccess: () => {
          toast.success("Country saved");
          onSaved?.(country);
        },
        onError: (err) => {
          toast.error(err.message || "Could not save country");
        },
      },
    );
  };

  return (
    <div
      role="region"
      aria-label="Select your country"
      data-testid="country-prompt-banner"
      className={[
        "rounded-lg border border-celo-forest/30 bg-celo-forest-soft/50",
        "p-4 sm:p-5",
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex-1">
        <p className="mb-1 text-base font-medium text-celo-dark dark:text-celo-light">
          Where do you shop from?
        </p>
        <p className="mb-3 text-sm text-celo-dark/70 dark:text-celo-light/70">
          Pick your country so we can show you sellers near you and
          match deliveries within your market.
        </p>
        <CountrySelector
          id="prompt-country-selector"
          value={country}
          onChange={setCountry}
          required
          disabled={isPending}
          data-testid="prompt-country-selector"
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || !country}
        data-testid="prompt-country-save"
        className={SAVE_CLASSES}
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
