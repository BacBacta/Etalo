/**
 * AddressSelectorList — Sprint J11.7 Block 6 (ADR-044).
 *
 * Radio-style list-picker over the buyer's saved addresses. Used at
 * checkout (Block 7) for picking the delivery destination. Radio
 * semantics for screen readers + keyboard nav out-of-the-box ; 44×44
 * touch targets.
 */
"use client";

import { countryName } from "@/lib/country";
import type { DeliveryAddress } from "@/lib/addresses/api";

interface Props {
  addresses: DeliveryAddress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Optional name attribute so multiple lists on the same page don't
   *  share radio group state. */
  name?: string;
}

export function AddressSelectorList({
  addresses,
  selectedId,
  onSelect,
  name = "delivery-address",
}: Props) {
  if (addresses.length === 0) {
    return null;
  }
  return (
    <fieldset
      data-testid="address-selector-list"
      className="space-y-2"
    >
      <legend className="sr-only">Choose a delivery address</legend>
      {addresses.map((a) => {
        const inputId = `addr-radio-${a.id}`;
        const checked = selectedId === a.id;
        return (
          <label
            key={a.id}
            htmlFor={inputId}
            data-testid={`address-selector-row-${a.id}`}
            className={[
              "flex cursor-pointer items-start gap-3",
              "rounded-lg border p-3",
              "min-h-[44px]",
              checked
                ? "border-celo-forest bg-celo-forest/5"
                : "border-neutral-200 bg-white hover:border-neutral-300",
            ].join(" ")}
          >
            <input
              id={inputId}
              type="radio"
              name={name}
              value={a.id}
              checked={checked}
              onChange={() => onSelect(a.id)}
              className="mt-1 h-5 w-5 accent-celo-forest"
              data-testid={`address-selector-radio-${a.id}`}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-base font-medium text-neutral-900">
                  {a.city}, {countryName(a.country)}
                </p>
                {a.is_default ? (
                  <span className="text-sm text-celo-forest">Default</span>
                ) : null}
              </div>
              <p className="text-sm text-neutral-600">{a.address_line}</p>
              <p className="text-sm text-neutral-500">{a.phone_number}</p>
            </div>
          </label>
        );
      })}
    </fieldset>
  );
}
