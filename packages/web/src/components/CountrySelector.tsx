/**
 * CountrySelector — Sprint J11.7 Block 4 (ADR-045).
 *
 * Reusable dropdown for V1 markets (Nigeria / Ghana / Kenya per
 * ADR-041 intra-only scope). Stores ISO 3166-1 alpha-3 codes
 * (NGA / GHA / KEN) under the hood; presents human-readable names
 * via lib/country.ts.
 *
 * Used by :
 * - ProfileTab (Block 4) — seller edits their country
 * - useBuyerCountry / /profile (Block 5) — buyer detection fallback
 * - AddressFormModal (Block 6/7) — address book country field
 *
 * a11y :
 * - Native <select> for screen-reader + keyboard nav out of the box
 * - 44×44 minimum touch target (CLAUDE.md design standards)
 * - Body text 16px (CLAUDE.md min size)
 * - WCAG AA contrast (Tailwind neutral-900 on neutral-50, ratio 19:1)
 */
"use client";

import { type ChangeEvent } from "react";

import { countryName } from "@/lib/country";

export const COUNTRY_OPTIONS = ["NGA", "GHA", "KEN"] as const;
export type CountryCode = (typeof COUNTRY_OPTIONS)[number];

export function isValidCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && (COUNTRY_OPTIONS as readonly string[]).includes(value);
}

export interface CountrySelectorProps {
  /** Selected ISO-3 code, or null for unselected (renders empty option). */
  value: CountryCode | null;
  onChange: (value: CountryCode) => void;
  /** Required field — empty option is omitted when true. */
  required?: boolean;
  /** Disable interaction (e.g. while saving). */
  disabled?: boolean;
  /** id used for the underlying <select> + <label htmlFor>. */
  id?: string;
  /** Optional label rendered above the select. */
  label?: string;
  /** Optional error message rendered below the select. */
  error?: string;
  /** Optional description rendered below the select (above any error). */
  description?: string;
  /** Optional className applied to the wrapping div. */
  className?: string;
  /** Forwarded to the <select> for testing. */
  "data-testid"?: string;
}

export function CountrySelector({
  value,
  onChange,
  required = false,
  disabled = false,
  id = "country-selector",
  label,
  error,
  description,
  className,
  "data-testid": testId = "country-selector",
}: CountrySelectorProps) {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (isValidCountryCode(next)) {
      onChange(next);
    }
  };

  const errorId = error ? `${id}-error` : undefined;
  const descId = description ? `${id}-desc` : undefined;
  const describedBy = [errorId, descId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      {label ? (
        <label
          htmlFor={id}
          className="mb-1 block text-base font-medium text-neutral-900"
        >
          {label}
          {required ? (
            <span className="ml-0.5 text-red-600" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <select
        id={id}
        data-testid={testId}
        value={value ?? ""}
        onChange={handleChange}
        required={required}
        disabled={disabled}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={[
          "min-h-[44px] w-full rounded-md border bg-white p-2 text-base",
          "text-neutral-900",
          error ? "border-red-500" : "border-neutral-300",
          "focus:border-celo-forest focus:outline-none focus:ring-2 focus:ring-celo-forest",
          "disabled:cursor-not-allowed disabled:bg-neutral-100",
        ].join(" ")}
      >
        {!required ? <option value="">Select a country…</option> : null}
        {required && value === null ? (
          <option value="" disabled>
            Select a country…
          </option>
        ) : null}
        {COUNTRY_OPTIONS.map((code) => (
          <option key={code} value={code}>
            {countryName(code)}
          </option>
        ))}
      </select>
      {description ? (
        <p id={descId} className="mt-1 text-sm text-neutral-600">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
