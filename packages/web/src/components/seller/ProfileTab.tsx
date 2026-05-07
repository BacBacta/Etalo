"use client";

import { ImageSquare } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CountrySelector,
  type CountryCode,
  isValidCountryCode,
} from "@/components/CountrySelector";
import { Button } from "@/components/ui/button";
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
// target user: Instagram/WhatsApp/TikTok). Other handles (Facebook /
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

export function ProfileTab({ profile, address, onUpdated }: Props) {
  const initialCountry: CountryCode | null = isValidCountryCode(profile.country)
    ? profile.country
    : null;
  const initialSocials = readSocials(profile.socials);

  const [shopName, setShopName] = useState(profile.shop_name);
  const [description, setDescription] = useState(profile.description ?? "");
  const [country, setCountry] = useState<CountryCode | null>(initialCountry);
  const [socials, setSocials] = useState<SocialsForm>(initialSocials);
  const [saving, setSaving] = useState(false);

  const dirty =
    shopName !== profile.shop_name ||
    (description ?? "") !== (profile.description ?? "") ||
    country !== initialCountry ||
    !socialsEqual(socials, initialSocials);

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
      if (!socialsEqual(socials, initialSocials)) {
        // Only persist non-empty values ; empty inputs treated as "clear
        // this handle" by the backend (replaced with null in the dict
        // server-side ; the JSONB merge is replace-all semantics here).
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Logo upload placeholder — visual slot only V1. The dashed
          border + ImageSquare icon mirrors Add product › Images so the
          seller has a concrete mental model of where the upload lives.
          Real wiring lands once IPFS pipeline scope is finalized. */}
      <div>
        <span className="mb-1 block text-base font-medium text-celo-dark dark:text-celo-light">
          Shop logo
        </span>
        <div
          aria-label="Shop logo upload placeholder"
          data-testid="profile-logo-placeholder"
          className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light/40"
        >
          <ImageSquare className="h-8 w-8" aria-hidden />
        </div>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Logo upload coming soon.
        </p>
      </div>
      <div>
        <label
          htmlFor="shop-name"
          className="mb-1 block text-base font-medium text-celo-dark dark:text-celo-light"
        >
          Shop name
        </label>
        <input
          id="shop-name"
          type="text"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
        />
      </div>
      <div>
        <label
          htmlFor="shop-description"
          className="mb-1 block text-base font-medium text-celo-dark dark:text-celo-light"
        >
          Description
        </label>
        <textarea
          id="shop-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
        />
      </div>
      <CountrySelector
        id="seller-profile-country"
        label="Country"
        value={country}
        onChange={setCountry}
        required
        disabled={saving}
        description="Buyers in your country can see your products by default."
        data-testid="profile-country-selector"
      />

      {/* Socials — V1 surfaces WhatsApp / Instagram / TikTok only
          (CLAUDE.md target user). Free-form text inputs ; backend
          stores the dict as-is. No URL parsing V1 — sellers paste
          whatever format they want (handle, phone number, full URL),
          the boutique page formats consistently. */}
      <fieldset className="space-y-3">
        <legend className="mb-1 text-base font-medium text-celo-dark dark:text-celo-light">
          Socials
        </legend>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Where buyers can find you outside the app. Optional.
        </p>
        <div>
          <label
            htmlFor="seller-socials-whatsapp"
            className="mb-1 block text-sm font-medium text-celo-dark dark:text-celo-light"
          >
            WhatsApp number
          </label>
          <input
            id="seller-socials-whatsapp"
            type="text"
            inputMode="tel"
            placeholder="+234 901 123 4567"
            value={socials.whatsapp}
            onChange={(e) =>
              setSocials((prev) => ({ ...prev, whatsapp: e.target.value }))
            }
            className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
          />
        </div>
        <div>
          <label
            htmlFor="seller-socials-instagram"
            className="mb-1 block text-sm font-medium text-celo-dark dark:text-celo-light"
          >
            Instagram handle
          </label>
          <input
            id="seller-socials-instagram"
            type="text"
            placeholder="@yourhandle"
            value={socials.instagram}
            onChange={(e) =>
              setSocials((prev) => ({ ...prev, instagram: e.target.value }))
            }
            className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
          />
        </div>
        <div>
          <label
            htmlFor="seller-socials-tiktok"
            className="mb-1 block text-sm font-medium text-celo-dark dark:text-celo-light"
          >
            TikTok handle
          </label>
          <input
            id="seller-socials-tiktok"
            type="text"
            placeholder="@yourhandle"
            value={socials.tiktok}
            onChange={(e) =>
              setSocials((prev) => ({ ...prev, tiktok: e.target.value }))
            }
            className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
          />
        </div>
      </fieldset>

      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Shop handle (@{profile.shop_handle}) is not editable.
      </p>
      {/* Save button : `variant="default"` (primary celo-forest) when
          dirty, `variant="outline"` (muted) when pristine. The seller
          immediately sees the CTA "wake up" the moment they edit
          anything — fixes the screenshot bug where the disabled +
          enabled states looked identical. */}
      <Button
        type="submit"
        disabled={!dirty || saving}
        variant={dirty ? "default" : "outline"}
        className="min-h-[44px]"
      >
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
