/**
 * CreateShopForm — premium self-service shop creation surface.
 *
 * Shown by SellerDashboardInner when `/sellers/me` returns no profile
 * for the connected wallet. Replaces the previous "Self-service
 * onboarding coming in V1.5 — contact our team" dead-end.
 *
 * UX principles applied here :
 *  - The boutique can ship with zero products. Adding products is
 *    explicitly framed as "the next step", not a blocker (backend
 *    change : `first_product` is now optional on `/onboarding/complete`).
 *  - One scrollable page, sectioned by intent (Identity → Pitch →
 *    Location → Social) — multi-step wizards feel heavy on a 360 px
 *    MiniPay viewport.
 *  - Live `etalo.xyz/<handle>` preview keeps the seller anchored in
 *    what they're actually building.
 *  - Handle is auto-suggested from `shop_name` until the seller edits
 *    it themselves — most informal sellers type their shop name first.
 *  - Submit CTA reflects the actual semantics ("Open my shop") and
 *    only enables once the minimum required fields are valid, so the
 *    user never hits a server-side validation error they could have
 *    been told about up front.
 */
"use client";

import { ArrowRight, Storefront } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  CountrySelector,
  type CountryCode,
} from "@/components/CountrySelector";
import { ImageUploader } from "@/components/seller/ImageUploader";
import { Button } from "@/components/ui/button";
import {
  createSellerProfile,
  ShopHandleTakenError,
  WalletAlreadyHasShopError,
  type SellerProfilePublic,
} from "@/lib/seller-api";

interface Props {
  walletAddress: string;
  onCreated: (profile: SellerProfilePublic) => void;
}

const HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

function slugifyHandle(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function validateHandle(handle: string): string | null {
  if (handle.length < 3) return "At least 3 characters.";
  if (handle.length > 30) return "30 characters max.";
  if (!HANDLE_REGEX.test(handle)) {
    return "Lowercase letters, numbers, and hyphens only.";
  }
  return null;
}

export function CreateShopForm({ walletAddress, onCreated }: Props) {
  const [shopName, setShopName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState<CountryCode | null>(null);
  const [logoIpfsHash, setLogoIpfsHash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);

  // Auto-suggest the handle from the shop name as long as the seller
  // hasn't touched the handle field. The moment they edit the handle
  // explicitly we stop overwriting their input.
  const effectiveHandle = handle;
  const handleValidationError = useMemo(
    () => (handle.length > 0 ? validateHandle(handle) : null),
    [handle],
  );

  const canSubmit =
    !submitting &&
    shopName.trim().length > 0 &&
    handle.length >= 3 &&
    !handleValidationError &&
    country !== null;

  const handleShopNameChange = (value: string) => {
    setShopName(value);
    if (!handleEdited) {
      const suggestion = slugifyHandle(value);
      setHandle(suggestion);
      setHandleError(null);
    }
  };

  const handleHandleChange = (value: string) => {
    setHandleEdited(true);
    // Strip leading @ + uppercase so the user can paste freely.
    const cleaned = value.replace(/^@+/, "").toLowerCase();
    setHandle(cleaned);
    setHandleError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setHandleError(null);
    try {
      const profile = await createSellerProfile(walletAddress, {
        shop_handle: handle,
        shop_name: shopName.trim(),
        country: country as CountryCode,
        description: description.trim() || null,
        logo_ipfs_hash: logoIpfsHash,
      });
      toast.success("Your shop is live");
      onCreated(profile);
    } catch (err) {
      if (err instanceof ShopHandleTakenError) {
        setHandleError("This handle is already taken — try another.");
      } else if (err instanceof WalletAlreadyHasShopError) {
        toast.error("This wallet already has a shop. Reloading…");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        toast.error("Couldn't create the shop. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const previewHandle = effectiveHandle || "yourhandle";

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        {/* Hero — sets the tone before the form. Illustration is the
            same vector used by the welcome screen so first-time sellers
            get visual continuity from the marketing surface to the
            actual creation step. */}
        <header className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/v5/onboarding-welcome.svg"
            alt=""
            aria-hidden="true"
            className="mb-4 h-auto w-full max-w-[200px]"
          />
          <h1 className="font-display text-display-3 text-celo-dark dark:text-celo-light">
            Open your shop
          </h1>
          <p className="mt-2 max-w-md text-base text-neutral-600 dark:text-celo-light/70">
            Your digital stall, open 24/7. Set up your identity now —
            you can add products right after, at your own pace.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-8">
          {/* ─── Section 1 : Identity ─── */}
          <section className="space-y-4 rounded-2xl border border-celo-dark/[8%] bg-white p-5 dark:border-celo-light/[8%] dark:bg-celo-dark-elevated">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-celo-forest/10 text-celo-forest dark:bg-celo-forest-bright/10 dark:text-celo-forest-bright"
              >
                <Storefront weight="duotone" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-celo-dark dark:text-celo-light">
                  Identity
                </h2>
                <p className="text-sm text-neutral-500 dark:text-celo-light/60">
                  How buyers will recognize you across Etalo.
                </p>
              </div>
            </div>

            {/* Logo upload. Reuses ImageUploader with maxImages=1 to
                match ProfileTab's pattern — one component for product
                photos AND for the single shop logo, less surface area
                to maintain. */}
            <div>
              <span className="mb-2 block text-base font-medium text-celo-dark dark:text-celo-light">
                Shop logo
              </span>
              <p className="mb-2 text-sm text-neutral-500 dark:text-celo-light/60">
                Square image, JPEG/PNG, max 5 MB. Optional.
              </p>
              <ImageUploader
                walletAddress={walletAddress}
                maxImages={1}
                initialIpfsHashes={logoIpfsHash ? [logoIpfsHash] : []}
                onChange={(hashes) => setLogoIpfsHash(hashes[0] ?? null)}
              />
            </div>

            <div>
              <label
                htmlFor="create-shop-name"
                className="mb-1 block text-base font-medium text-celo-dark dark:text-celo-light"
              >
                Shop name
              </label>
              <input
                id="create-shop-name"
                type="text"
                value={shopName}
                onChange={(e) => handleShopNameChange(e.target.value)}
                disabled={submitting}
                maxLength={100}
                placeholder="Mama Adaeze's Boutique"
                autoComplete="off"
                data-testid="create-shop-name"
                className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark placeholder:text-neutral-400 dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
              />
            </div>

            <div>
              <label
                htmlFor="create-shop-handle"
                className="mb-1 block text-base font-medium text-celo-dark dark:text-celo-light"
              >
                Shop handle
              </label>
              <div className="flex items-center rounded-md border border-neutral-300 bg-white focus-within:border-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-bg dark:focus-within:border-celo-forest-bright">
                <span
                  aria-hidden
                  className="pl-3 pr-1 text-base text-neutral-500 dark:text-celo-light/60"
                >
                  @
                </span>
                <input
                  id="create-shop-handle"
                  type="text"
                  inputMode="text"
                  value={handle}
                  onChange={(e) => handleHandleChange(e.target.value)}
                  disabled={submitting}
                  maxLength={30}
                  placeholder="yourhandle"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-testid="create-shop-handle"
                  aria-invalid={
                    handleValidationError || handleError ? "true" : "false"
                  }
                  aria-describedby="create-shop-handle-help"
                  className="min-h-[44px] flex-1 bg-transparent py-2 pr-3 text-base text-celo-dark outline-none placeholder:text-neutral-400 dark:text-celo-light"
                />
              </div>
              <p
                id="create-shop-handle-help"
                className="mt-1 break-all text-sm text-neutral-500 dark:text-celo-light/60"
              >
                Your boutique URL :{" "}
                <span className="font-medium text-celo-dark dark:text-celo-light">
                  etalo.xyz/{previewHandle}
                </span>
              </p>
              {(handleValidationError || handleError) && (
                <p
                  role="alert"
                  data-testid="create-shop-handle-error"
                  className="mt-1 text-sm text-red-600 dark:text-celo-red-bright"
                >
                  {handleError ?? handleValidationError}
                </p>
              )}
            </div>
          </section>

          {/* ─── Section 2 : Description ─── */}
          <section className="space-y-3 rounded-2xl border border-celo-dark/[8%] bg-white p-5 dark:border-celo-light/[8%] dark:bg-celo-dark-elevated">
            <div>
              <h2 className="text-base font-semibold text-celo-dark dark:text-celo-light">
                Your pitch
              </h2>
              <p className="text-sm text-neutral-500 dark:text-celo-light/60">
                One short paragraph buyers see on your boutique page.
              </p>
            </div>
            <textarea
              id="create-shop-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              rows={4}
              maxLength={500}
              placeholder="Ankara prints, hand-finished, shipping from Lagos."
              data-testid="create-shop-description"
              className="w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark placeholder:text-neutral-400 dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
            />
            <p className="text-right text-sm text-neutral-500 dark:text-celo-light/60">
              {description.length}/500
            </p>
          </section>

          {/* ─── Section 3 : Location ─── */}
          <section className="space-y-3 rounded-2xl border border-celo-dark/[8%] bg-white p-5 dark:border-celo-light/[8%] dark:bg-celo-dark-elevated">
            <div>
              <h2 className="text-base font-semibold text-celo-dark dark:text-celo-light">
                Where you ship from
              </h2>
              <p className="text-sm text-neutral-500 dark:text-celo-light/60">
                Etalo V1 supports intra-Africa trade only — buyers in your
                country see your shop first.
              </p>
            </div>
            <CountrySelector
              id="create-shop-country"
              value={country}
              onChange={setCountry}
              required
              disabled={submitting}
              data-testid="create-shop-country"
            />
          </section>

          {/* ─── Submit ─── */}
          <div className="space-y-2">
            <Button
              type="submit"
              disabled={!canSubmit}
              className="min-h-[48px] w-full"
              data-testid="create-shop-submit"
            >
              {submitting ? "Opening your shop…" : "Open my shop"}
              {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
            <p className="text-center text-sm text-neutral-500 dark:text-celo-light/60">
              No products required — add them right after from the
              Products tab.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
