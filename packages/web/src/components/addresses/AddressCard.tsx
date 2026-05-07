/**
 * AddressCard — Sprint J11.7 Block 6 (ADR-044).
 *
 * One row in the address book. Edit + Delete + Set-default buttons.
 * Responsive : stacked on mobile, side-by-side on sm+.
 */
"use client";

import { countryName } from "@/lib/country";
import type { DeliveryAddress } from "@/lib/addresses/api";
import { Button } from "@/components/ui/button";

interface Props {
  address: DeliveryAddress;
  onEdit: (a: DeliveryAddress) => void;
  onDelete: (a: DeliveryAddress) => void;
  onSetDefault: (a: DeliveryAddress) => void;
  /** Disable buttons during pending mutation. */
  disabled?: boolean;
}

export function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  disabled,
}: Props) {
  const country = countryName(address.country);
  return (
    <article
      data-testid={`address-card-${address.id}`}
      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 space-y-1">
          <header className="flex items-center gap-2">
            <h3 className="text-base font-medium text-neutral-900">
              {address.city}, {country}
            </h3>
            {address.is_default ? (
              <span
                data-testid={`address-default-badge-${address.id}`}
                className="rounded-full bg-celo-forest/10 px-2 py-0.5 text-sm font-medium text-celo-forest"
              >
                Default
              </span>
            ) : null}
          </header>
          <p className="text-sm text-neutral-700">{address.region}</p>
          <p className="text-sm text-neutral-700">{address.address_line}</p>
          {address.landmark ? (
            <p className="text-sm text-neutral-500">
              Landmark: {address.landmark}
            </p>
          ) : null}
          <p className="text-sm text-neutral-700">{address.phone_number}</p>
          {address.notes ? (
            <p className="text-sm text-neutral-500">Notes: {address.notes}</p>
          ) : null}
        </div>
        <div className="flex flex-row flex-wrap gap-2 sm:flex-col">
          <Button
            type="button"
            variant="outline"
            onClick={() => onEdit(address)}
            disabled={disabled}
            data-testid={`address-edit-${address.id}`}
            className="min-h-[44px]"
          >
            Edit
          </Button>
          {!address.is_default ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onSetDefault(address)}
              disabled={disabled}
              data-testid={`address-set-default-${address.id}`}
              className="min-h-[44px]"
            >
              Set default
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onDelete(address)}
            disabled={disabled}
            data-testid={`address-delete-${address.id}`}
            className="min-h-[44px] text-red-600 hover:bg-red-50"
          >
            Delete
          </Button>
        </div>
      </div>
    </article>
  );
}
