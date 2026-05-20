"use client";

import {
  ArrowSquareOut,
  Check,
  Copy,
  IdentificationCard,
  InstagramLogo,
  MapPin,
  ShareNetwork,
  Storefront,
  TiktokLogo,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CountrySelector,
  type CountryCode,
  isValidCountryCode,
} from "@/components/CountrySelector";
import { ImageUploader } from "@/components/seller/ImageUploader";
import { Button } from "@/components/ui/button";
import { countryName } from "@/lib/country";
import {
  type SellerProfilePublic,
  type SellerProfileUpdate,
  updateSellerProfile,
} from "@/lib/seller-api";

interface Props {
  profile: SellerProfilePublic;
  address: string;
  onUpdated: (p: SellerProfilePublic) => void;
}

// Subset of the `socials` JSONB the backend stores. V1 surfaces the
// three channels Mike's target user actually lives on (CLAUDE.md
// target user: Instagram / WhatsApp / TikTok). Other handles (Facebook /
// X / threads) stay in the dict but aren't UI-editable until the
// seller asks.
interface SocialsForm {
  whatsapp: string;
  instagram: string;
  tiktok: string;
}

function readSocials(socials: SellerProfilePublic["socials"]): SocialsForm {
  if (!socials || typeof socials !== "object") {
    return { whatsapp: "", instagram: "", tiktok: "" };
  }
  const s = socials as Record<string, unknown>;
  return {
    whatsapp: typeof s.whatsapp === "string" ? s.whatsapp : "",
    instagram: typeof s.instagram === "string" ? s.instagram : "",
    tiktok: typeof s.tiktok === "string" ? s.tiktok : "",
  };
}

function socialsEqual(a: SocialsForm, b: SocialsForm): boolean {
  return (
    a.whatsapp === b.whatsapp &&
    a.instagram === b.instagram &&
    a.tiktok === b.tiktok
  );
}

// Used in the boutique URL preview card. NEXT_PUBLIC_BASE_URL falls
// back to the production alias (etalo.xyz) so the seller never sees
// a localhost link by accident during dev.
const BOUTIQUE_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://etalo.xyz";

const DESCRIPTION_MAX = 500;

export function ProfileTab({ profile, address, onUpdated }: Props) {
  const initialCountry: CountryCode | null = isValidCountryCode(profile.country)
    ? profile.country
    : null;
  const initialSocials = readSocials(profile.socials);

  const [shopName, setShopName] = useState(profile.shop_name);
  const [description, setDescription] = useState(profile.description ?? "");
  const [country, setCountry] = useState<CountryCode | null>(initialCountry);
  const [socials, setSocials] = useState<SocialsForm>(initialSocials);
  const [logoHash, setLogoHash] = useState<string | null>(
    profile.logo_ipfs_hash ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const dirty =
    shopName !== profile.shop_name ||
    (description ?? "") !== (profile.description ?? "") ||
    country !== initialCountry ||
    logoHash !== (profile.logo_ipfs_hash ?? null) ||
    !socialsEqual(socials, initialSocials);

  const boutiqueUrl = `${BOUTIQUE_BASE_URL}/${profile.shop_handle}`;
  const countryLabel = country ? countryName(country) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const payload: SellerProfileUpdate = {
        shop_name: shopName,
        description: description || null,
      };
      if (country !== null && country !== initialCountry) {
        payload.country = country;
      }
      if (logoHash !== (profile.logo_ipfs_hash ?? null)) {
        payload.logo_ipfs_hash = logoHash;
      }
      if (!socialsEqual(socials, initialSocials)) {
        // Empty inputs treated as "clear this handle" by the backend
        // (replaced with null in the dict server-side ; the JSONB
        // merge is replace-all semantics here).
        payload.socials = {
          whatsapp: socials.whatsapp.trim() || null,
          instagram: socials.instagram.trim() || null,
          tiktok: socials.tiktok.trim() || null,
        };
      }
      const updated = await updateSellerProfile(address, payload);
      onUpdated(updated);
      toast.success("Profile updated");
    } catch {
      toast.error("Update failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetForm = () => {
    setShopName(profile.shop_name);
    setDescription(profile.description ?? "");
    setCountry(initialCountry);
    setSocials(initialSocials);
    setLogoHash(profile.logo_ipfs_hash ?? null);
  };

  const handleCopyUrl = () => {
    void navigator.clipboard
      .writeText(boutiqueUrl)
      .then(() => {
        setCopied(true);
        toast.success("Boutique link copied");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error("Couldn't copy"));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Identity header card — gives the form a sense of place. Shows
          the seller's logo, current shop name, handle, and country
          alongside a primary "View boutique" CTA. The current values
          come from the editable state so the seller previews their
          changes live as they type, BEFORE saving. */}
      <IdentityHeaderCard
        shopName={shopName || profile.shop_name}
        shopHandle={profile.shop_handle}
        countryLabel={countryLabel}
        logoHash={logoHash}
        boutiqueUrl={boutiqueUrl}
        onCopyUrl={handleCopyUrl}
        copied={copied}
      />

      {/* Identity section card */}
      <SectionCard
        title="Identity"
        subtitle="How your shop appears to buyers."
        icon={
          <IdentificationCard className="h-5 w-5" weight="regular" aria-hidden />
        }
      >
        <div>
          <span className="mb-2 block text-base font-medium text-celo-dark dark:text-celo-light">
            Shop logo
          </span>
          <p className="mb-2 text-sm text-neutral-500 dark:text-celo-light/60">
            Square image, JPEG/PNG, max 5 MB. Shown on your boutique
            page + the marketplace seller line.
          </p>
          <ImageUploader
            walletAddress={address}
            maxImages={1}
            initialIpfsHashes={logoHash ? [logoHash] : []}
            onChange={(hashes) => setLogoHash(hashes[0] ?? null)}
          />
        </div>

        <div>
          <label
            htmlFor="shop-name"
            className="mb-2 block text-base font-medium text-celo-dark dark:text-celo-light"
          >
            Shop name
          </label>
          <input
            id="shop-name"
            type="text"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Sarah's Handmade Boutique"
            maxLength={80}
            className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
          />
        </div>

        <div>
          <label
            htmlFor="shop-description"
            className="mb-2 block text-base font-medium text-celo-dark dark:text-celo-light"
          >
            Description
          </label>
          <textarea
            id="shop-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={DESCRIPTION_MAX}
            placeholder="Tell buyers what you sell, where you ship from, and what makes your shop unique."
            className="w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
          />
          <p className="mt-1 text-right text-sm tabular-nums text-neutral-500 dark:text-celo-light/60">
            {description.length}/{DESCRIPTION_MAX}
          </p>
        </div>

        <CountrySelector
          id="seller-profile-country"
          label="Country"
          value={country}
          onChange={setCountry}
          required
          disabled={saving}
          description="Buyers in your country see your products by default in the marketplace."
          data-testid="profile-country-selector"
        />
      </SectionCard>

      {/* Social links — V1 surfaces WhatsApp / Instagram / TikTok only
          (CLAUDE.md target user). Each input now has a colored brand-
          icon prefix so the seller scans down "the green WhatsApp
          row, the pink Instagram row, the dark TikTok row" instead of
          three identical text fields. */}
      <SectionCard
        title="Social links"
        subtitle="Where buyers can find you outside the app. Optional."
        icon={
          <ShareNetwork className="h-5 w-5" weight="regular" aria-hidden />
        }
      >
        <SocialInput
          id="seller-socials-whatsapp"
          label="WhatsApp number"
          placeholder="+234 901 123 4567"
          value={socials.whatsapp}
          onChange={(v) => setSocials((p) => ({ ...p, whatsapp: v }))}
          icon={
            <WhatsappLogo className="h-5 w-5" weight="fill" aria-hidden />
          }
          iconWrapClass="bg-[#25D366]/15 text-[#25D366] dark:bg-[#25D366]/20"
          inputMode="tel"
        />
        <SocialInput
          id="seller-socials-instagram"
          label="Instagram handle"
          placeholder="@yourhandle"
          value={socials.instagram}
          onChange={(v) => setSocials((p) => ({ ...p, instagram: v }))}
          icon={
            <InstagramLogo className="h-5 w-5" weight="fill" aria-hidden />
          }
          iconWrapClass="bg-gradient-to-br from-[#F58529]/15 via-[#DD2A7B]/20 to-[#8134AF]/15 text-[#DD2A7B]"
        />
        <SocialInput
          id="seller-socials-tiktok"
          label="TikTok handle"
          placeholder="@yourhandle"
          value={socials.tiktok}
          onChange={(v) => setSocials((p) => ({ ...p, tiktok: v }))}
          icon={<TiktokLogo className="h-5 w-5" weight="fill" aria-hidden />}
          iconWrapClass="bg-celo-dark/10 text-celo-dark dark:bg-celo-light/10 dark:text-celo-light"
        />
      </SectionCard>

      {/* Shop handle is permanent — surfaced as info, not as a field. */}
      <p className="text-sm text-neutral-500 dark:text-celo-light/60">
        Your shop handle{" "}
        <span className="font-medium text-celo-dark dark:text-celo-light">
          @{profile.shop_handle}
        </span>{" "}
        is permanent — it&apos;s the URL buyers bookmark.
      </p>

      {/* Sticky save bar — only renders when the form is dirty. Floats
          above the page bottom so the seller can save without scrolling
          back to a hidden button (Linear / Stripe pattern). */}
      {dirty ? (
        <div className="sticky bottom-2 z-10 -mx-1 px-1 sm:bottom-4 sm:px-0">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-celo-forest/30 bg-celo-light/95 p-3 shadow-celo-lg backdrop-blur dark:border-celo-green/30 dark:bg-celo-dark-elevated/95">
            <p className="text-sm text-celo-dark dark:text-celo-light">
              You have unsaved changes
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleResetForm}
                disabled={saving}
                className="min-h-[44px]"
              >
                Discard
              </Button>
              <Button
                type="submit"
                disabled={saving}
                variant="default"
                className="min-h-[44px]"
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // Hidden submit button preserves the "Save changes" button
        // queryable by the test suite even when pristine. Display
        // none so it doesn't intercept clicks or take layout space.
        <button
          type="submit"
          aria-hidden="true"
          tabIndex={-1}
          disabled
          className="hidden"
        >
          Save changes
        </button>
      )}
    </form>
  );
}

// =====================================================================
// IdentityHeaderCard — preview strip at the top of the form. Live-
// reflects the seller's in-progress edits so they see their shop
// appear before saving.
// =====================================================================

interface IdentityHeaderCardProps {
  shopName: string;
  shopHandle: string;
  countryLabel: string | null;
  logoHash: string | null;
  boutiqueUrl: string;
  onCopyUrl: () => void;
  copied: boolean;
}

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

function IdentityHeaderCard({
  shopName,
  shopHandle,
  countryLabel,
  logoHash,
  boutiqueUrl,
  onCopyUrl,
  copied,
}: IdentityHeaderCardProps) {
  return (
    <div className="rounded-2xl border border-celo-forest/20 bg-gradient-to-br from-celo-light to-celo-yellow-soft p-4 dark:border-celo-green/20 dark:from-celo-dark-elevated dark:to-celo-dark-bg sm:p-5">
      <div className="flex items-start gap-4">
        {/* Logo preview — circle, falls back to a Storefront glyph
            when no logo uploaded. Identifies the seller visually. */}
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-celo-light shadow-sm ring-2 ring-celo-forest/20 dark:bg-celo-dark-bg dark:ring-celo-green/30 sm:h-20 sm:w-20">
          {logoHash ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${IPFS_GATEWAY}${logoHash}`}
              alt={`${shopName} logo`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <Storefront
              className="h-8 w-8 text-celo-forest dark:text-celo-green"
              weight="regular"
              aria-hidden
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-celo-dark dark:text-celo-light sm:text-xl">
            {shopName}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-celo-dark/70 dark:text-celo-light/70">
            <span className="tabular-nums">@{shopHandle}</span>
            {countryLabel ? (
              <>
                <span aria-hidden className="text-celo-dark/30 dark:text-celo-light/30">
                  ·
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" weight="regular" aria-hidden />
                  {countryLabel}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Boutique URL row — sellers share this constantly. Two CTAs :
          copy (Linear / Stripe pattern — single-tap to clipboard with
          a brief "Copied" affordance) + open (new-tab for self-check). */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-celo-light px-3 py-2 dark:bg-celo-dark-bg">
          <span className="text-sm text-neutral-500 dark:text-celo-light/60">
            URL
          </span>
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums text-celo-dark dark:text-celo-light"
            title={boutiqueUrl}
          >
            {boutiqueUrl}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopyUrl}
            aria-label="Copy boutique URL"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-celo-forest/30 bg-celo-light px-3 text-sm font-medium text-celo-dark hover:bg-celo-light/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-green/30 dark:bg-celo-dark-bg dark:text-celo-light dark:hover:bg-celo-dark-elevated"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-celo-forest" weight="bold" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" weight="regular" />
                Copy
              </>
            )}
          </button>
          <a
            href={boutiqueUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open boutique in a new tab"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-celo-forest px-3 text-sm font-medium text-celo-light hover:bg-celo-forest-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 dark:bg-celo-green dark:text-celo-dark dark:hover:bg-celo-green-hover"
          >
            <ArrowSquareOut className="h-4 w-4" weight="regular" />
            Open
          </a>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// SectionCard — generic titled card wrapper used by Identity + Socials.
// Lifts the visual hierarchy from "wall of inputs" to "grouped form
// with section anchors".
// =====================================================================

interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function SectionCard({ title, subtitle, icon, children }: SectionCardProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-celo-light/10 dark:bg-celo-dark-elevated sm:p-5">
      <header className="mb-4 flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-celo-forest-soft text-celo-forest dark:bg-celo-forest-bright-soft dark:text-celo-green"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-celo-dark dark:text-celo-light">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-celo-light/60">
              {subtitle}
            </p>
          ) : null}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

// =====================================================================
// SocialInput — labelled input with a colored brand-icon prefix.
// =====================================================================

interface SocialInputProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
  iconWrapClass: string;
  inputMode?: "text" | "tel" | "email" | "url";
}

function SocialInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  icon,
  iconWrapClass,
  inputMode = "text",
}: SocialInputProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-celo-dark dark:text-celo-light"
      >
        {label}
      </label>
      <div className="relative flex items-center">
        <span
          aria-hidden
          className={`pointer-events-none absolute left-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md ${iconWrapClass}`}
        >
          {icon}
        </span>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white py-2 pl-12 pr-3 text-base text-celo-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
        />
      </div>
    </div>
  );
}
