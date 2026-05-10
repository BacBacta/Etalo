/**
 * InlineDeliveryAddressForm — ADR-050 (V1 inline checkout pivot).
 *
 * The buyer fills delivery details directly on the checkout page —
 * no detour to /profile/addresses, no modal. Submission writes
 * `Order.delivery_address_snapshot` JSONB directly post-fund (see
 * snapshot-api.ts `setOrderDeliverySnapshotInline`).
 *
 * Designed for the African informal-ecom context : recipient_name is
 * required (couriers refuse packages without it), area is a separate
 * field (Lekki / Karen / East Legon etc. matter more than street
 * numbers), and the region label adapts to the country picked
 * ("State" for NGA, "County" for KEN, "Region" for GHA).
 *
 * Pre-fills from `sessionStorage` if the buyer already filled a form
 * during this session — single-tap "Use last delivery address" button
 * restores it. No server persistence outside the snapshot.
 */
"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CountrySelector,
  type CountryCode,
  isValidCountryCode,
} from "@/components/CountrySelector";

export interface InlineDeliveryAddressData {
  recipient_name: string;
  phone_number: string;
  country: string; // ISO 3166-1 alpha-3
  region: string;
  city: string;
  area: string;
  address_line: string;
  landmark: string;
  notes: string;
}

const EMPTY_FORM: InlineDeliveryAddressData = {
  recipient_name: "",
  phone_number: "",
  country: "",
  region: "",
  city: "",
  area: "",
  address_line: "",
  landmark: "",
  notes: "",
};

const SESSION_STORAGE_KEY = "etalo.checkout.delivery.last";

// Per-country UI labels for the same `region` field — schema stays
// generic, the seller sees a label that matches their mental model.
const REGION_LABEL_BY_COUNTRY: Record<string, string> = {
  NGA: "State",
  KEN: "County",
  GHA: "Region",
};

// Per-country phone placeholder hints — free-text input but a country-
// specific example reduces format mistakes.
const PHONE_PLACEHOLDER_BY_COUNTRY: Record<string, string> = {
  NGA: "+234 80 1234 5678",
  KEN: "+254 71 234 5678",
  GHA: "+233 24 123 4567",
};

const ADDRESS_PLACEHOLDER_BY_COUNTRY: Record<string, string> = {
  NGA: "Plot 12B, off Adeola Odeku Street, Block C",
  KEN: "Karen Plains Apartments, House 7, Ngong Road",
  GHA: "No. 14, East Legon Road, near A&C Mall",
};

interface Props {
  value: InlineDeliveryAddressData;
  onChange: (value: InlineDeliveryAddressData) => void;
  /** Buyer's registered country from useBuyerCountry — pre-fills the
   *  country field on first mount when no sessionStorage entry exists. */
  defaultCountry?: string | null;
  /** Optional country guard — when set, mismatching country surfaces
   *  an inline error (V1 intra-Africa scope, ADR-045). */
  expectedCountry?: string | null;
}

export function InlineDeliveryAddressForm({
  value,
  onChange,
  defaultCountry,
  expectedCountry,
}: Props) {
  const [showLastUsed, setShowLastUsed] = useState(false);

  // On first mount, check sessionStorage for a previously-filled form.
  // If found, surface a "Use last delivery address" button. If not,
  // optionally pre-fill country from the buyer's profile.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      setShowLastUsed(true);
      return;
    }
    if (defaultCountry && !value.country) {
      onChange({ ...value, country: defaultCountry });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUseLast = () => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as InlineDeliveryAddressData;
      onChange({ ...EMPTY_FORM, ...parsed });
      setShowLastUsed(false);
    } catch {
      // Corrupt sessionStorage — wipe and continue with empty form.
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      setShowLastUsed(false);
    }
  };

  const regionLabel =
    REGION_LABEL_BY_COUNTRY[value.country] ?? "Region";
  const phonePlaceholder =
    PHONE_PLACEHOLDER_BY_COUNTRY[value.country] ?? "+234 80 1234 5678";
  const addressPlaceholder =
    ADDRESS_PLACEHOLDER_BY_COUNTRY[value.country] ??
    "Plot 12B, off Adeola Odeku Street";

  const countryMismatch =
    expectedCountry !== undefined &&
    expectedCountry !== null &&
    value.country !== "" &&
    value.country !== expectedCountry;

  return (
    <div
      data-testid="inline-delivery-form"
      className="rounded-md border border-neutral-200 bg-white p-4"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">Delivery address</h2>
        {showLastUsed ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleUseLast}
            data-testid="inline-delivery-use-last"
            className="min-h-[44px]"
          >
            Use last delivery
          </Button>
        ) : null}
      </header>

      <div className="space-y-3">
        <Field
          label="Recipient name"
          required
          hint="Full name as on ID — courier checks the label."
        >
          <input
            type="text"
            data-testid="inline-delivery-recipient-name"
            value={value.recipient_name}
            onChange={(e) =>
              onChange({ ...value, recipient_name: e.target.value })
            }
            placeholder="Adaeze Okafor"
            minLength={2}
            maxLength={100}
            required
            className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base"
          />
        </Field>

        <Field
          label="Country"
          required
          hint="V1 intra-Africa scope : Nigeria, Ghana, Kenya."
        >
          <CountrySelector
            value={
              isValidCountryCode(value.country)
                ? (value.country as CountryCode)
                : null
            }
            onChange={(c) => onChange({ ...value, country: c })}
          />
        </Field>

        <Field
          label="Phone number"
          required
          hint="Include + and country code. Courier calls / WhatsApps this number."
        >
          <input
            type="tel"
            data-testid="inline-delivery-phone"
            value={value.phone_number}
            onChange={(e) =>
              onChange({ ...value, phone_number: e.target.value })
            }
            placeholder={phonePlaceholder}
            minLength={5}
            maxLength={20}
            required
            className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={regionLabel} required>
            <input
              type="text"
              data-testid="inline-delivery-region"
              value={value.region}
              onChange={(e) =>
                onChange({ ...value, region: e.target.value })
              }
              placeholder={
                value.country === "NGA"
                  ? "Lagos State"
                  : value.country === "KEN"
                    ? "Nairobi County"
                    : value.country === "GHA"
                      ? "Greater Accra"
                      : ""
              }
              maxLength={100}
              required
              className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base"
            />
          </Field>

          <Field label="City / Town" required>
            <input
              type="text"
              data-testid="inline-delivery-city"
              value={value.city}
              onChange={(e) =>
                onChange({ ...value, city: e.target.value })
              }
              placeholder={
                value.country === "NGA"
                  ? "Lagos"
                  : value.country === "KEN"
                    ? "Nairobi"
                    : value.country === "GHA"
                      ? "Accra"
                      : ""
              }
              maxLength={100}
              required
              className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base"
            />
          </Field>
        </div>

        <Field
          label="Area / Neighborhood"
          required
          hint="Estate, suburb, district — courier asks for this first."
        >
          <input
            type="text"
            data-testid="inline-delivery-area"
            value={value.area}
            onChange={(e) =>
              onChange({ ...value, area: e.target.value })
            }
            placeholder={
              value.country === "NGA"
                ? "Lekki Phase 1"
                : value.country === "KEN"
                  ? "Karen"
                  : value.country === "GHA"
                    ? "East Legon"
                    : ""
            }
            maxLength={100}
            required
            className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base"
          />
        </Field>

        <Field
          label="Address details"
          required
          hint="Building, plot, street — include landmarks if no formal address."
        >
          <textarea
            data-testid="inline-delivery-address-line"
            value={value.address_line}
            onChange={(e) =>
              onChange({ ...value, address_line: e.target.value })
            }
            placeholder={addressPlaceholder}
            rows={3}
            minLength={3}
            maxLength={500}
            required
            className="w-full rounded-md border border-neutral-300 bg-white p-2 text-base"
          />
        </Field>

        <Field
          label="Landmark"
          hint="Optional — easy reference for the courier."
        >
          <input
            type="text"
            data-testid="inline-delivery-landmark"
            value={value.landmark}
            onChange={(e) =>
              onChange({ ...value, landmark: e.target.value })
            }
            placeholder="Behind the blue gate, opposite the bakery"
            maxLength={200}
            className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base"
          />
        </Field>

        <Field
          label="Delivery notes"
          hint="Optional — gate code, preferred time, anything special."
        >
          <textarea
            data-testid="inline-delivery-notes"
            value={value.notes}
            onChange={(e) =>
              onChange({ ...value, notes: e.target.value })
            }
            placeholder="Call when 5 minutes away. Gate code 4520."
            rows={2}
            maxLength={500}
            className="w-full rounded-md border border-neutral-300 bg-white p-2 text-base"
          />
        </Field>
      </div>

      {countryMismatch ? (
        <p
          role="alert"
          data-testid="inline-delivery-country-mismatch"
          className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900"
        >
          This seller only delivers within{" "}
          {expectedCountry === "NGA"
            ? "Nigeria"
            : expectedCountry === "KEN"
              ? "Kenya"
              : expectedCountry === "GHA"
                ? "Ghana"
                : expectedCountry}
          . Pick that country to continue.
        </p>
      ) : null}
    </div>
  );
}

/** Returns true when ALL required fields are non-empty after trim. */
export function isInlineDeliveryFormReady(
  value: InlineDeliveryAddressData,
  expectedCountry?: string | null,
): boolean {
  if (!value.recipient_name.trim()) return false;
  if (!value.phone_number.trim()) return false;
  if (!value.country) return false;
  if (!value.region.trim()) return false;
  if (!value.city.trim()) return false;
  if (!value.area.trim()) return false;
  if (!value.address_line.trim()) return false;
  if (expectedCountry && value.country !== expectedCountry) return false;
  return true;
}

/** Save the current form to sessionStorage so the buyer doesn't retype
 *  if they checkout twice in the same session. Called on successful
 *  snapshot post-fund. */
export function persistInlineDeliveryToSession(
  value: InlineDeliveryAddressData,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // sessionStorage may be unavailable (incognito / quota) — non-fatal.
  }
}

export { EMPTY_FORM as EMPTY_INLINE_DELIVERY_FORM };

// Tiny field wrapper — label + optional hint + child input. Mirrors the
// FormField pattern in ProductFormDialog without depending on it.
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-base font-medium">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-sm text-neutral-500">{hint}</span>
      ) : null}
    </label>
  );
}
