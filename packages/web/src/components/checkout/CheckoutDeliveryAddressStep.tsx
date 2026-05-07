/**
 * CheckoutDeliveryAddressStep — Sprint J11.7 Block 7 (ADR-044 + ADR-045).
 *
 * Pre-flight delivery address picker for the checkout idle phase.
 * Surfaces the buyer's saved address book ; if empty, prompts them
 * to add one inline. Validates the picked address country matches
 * the buyer's registered country (defense-in-depth even though the
 * backend cart-token issuance already enforced this in Block 3 ;
 * a clear FE error message beats a generic 422 from a stale token).
 */
"use client";

import { useEffect, useMemo, useState } from "react";

import { AddressFormModal } from "@/components/addresses/AddressFormModal";
import { AddressSelectorList } from "@/components/addresses/AddressSelectorList";
import { Button } from "@/components/ui/button";
import { useAddresses } from "@/hooks/useAddresses";
import { useBuyerCountry } from "@/hooks/useBuyerCountry";
import type { DeliveryAddress } from "@/lib/addresses/api";
import { countryName } from "@/lib/country";

interface Props {
  wallet: string;
  selectedId: string | null;
  onSelectedChange: (id: string | null) => void;
  /** Optional country guard ; when provided, the selected address must
   *  match. Pass the buyer's country (from useBuyerCountry) — V1 intra
   *  scope means seller country == buyer country == address country. */
  expectedCountry?: string | null;
}

export function CheckoutDeliveryAddressStep({
  wallet,
  selectedId,
  onSelectedChange,
  expectedCountry,
}: Props) {
  const addresses = useAddresses({ wallet });
  const buyerCountryQuery = useBuyerCountry({ wallet });
  const items = useMemo(() => addresses.data?.items ?? [], [addresses.data]);
  const [modalOpen, setModalOpen] = useState(false);

  // Auto-pick default on first load if nothing picked yet.
  useEffect(() => {
    if (selectedId !== null) return;
    if (items.length === 0) return;
    const def = items.find((a) => a.is_default) ?? items[0];
    onSelectedChange(def.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId]);

  const selected: DeliveryAddress | null = useMemo(() => {
    if (selectedId === null) return null;
    return items.find((a) => a.id === selectedId) ?? null;
  }, [items, selectedId]);

  const buyerCountry =
    expectedCountry ?? buyerCountryQuery.data?.country ?? null;
  const countryMismatch =
    selected !== null &&
    buyerCountry !== null &&
    selected.country !== buyerCountry;

  return (
    <section
      data-testid="checkout-delivery-step"
      className="rounded-md border border-neutral-200 bg-neutral-50 p-4"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">Delivery address</h2>
        <Button
          type="button"
          variant="outline"
          onClick={() => setModalOpen(true)}
          data-testid="checkout-add-address"
          className="min-h-[44px]"
        >
          {items.length === 0 ? "Add address" : "Add new"}
        </Button>
      </header>

      {addresses.isLoading ? (
        <p
          className="text-sm text-neutral-600"
          data-testid="checkout-delivery-loading"
        >
          Loading saved addresses…
        </p>
      ) : addresses.isError ? (
        <p
          role="alert"
          className="text-sm text-red-700"
          data-testid="checkout-delivery-error"
        >
          Could not load your addresses. Add a new one to continue.
        </p>
      ) : items.length === 0 ? (
        <div
          data-testid="checkout-delivery-empty"
          className="rounded-md bg-white p-3 text-sm text-neutral-700"
        >
          No saved addresses. Add one to continue checkout.
        </div>
      ) : (
        <AddressSelectorList
          addresses={items}
          selectedId={selectedId}
          onSelect={onSelectedChange}
        />
      )}

      {countryMismatch ? (
        <p
          role="alert"
          data-testid="checkout-country-mismatch"
          className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900"
        >
          This seller delivers only in {countryName(buyerCountry)}. Pick or
          add a {countryName(buyerCountry)} address to continue.
        </p>
      ) : null}

      <AddressFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        wallet={wallet}
        onSaved={(addr) => onSelectedChange(addr.id)}
      />
    </section>
  );
}

/**
 * Helper for parents to know whether the picker's current state is
 * fundable (selected + country matches).
 */
export function isCheckoutAddressReady({
  selectedId,
  selectedCountry,
  expectedCountry,
}: {
  selectedId: string | null;
  selectedCountry: string | null | undefined;
  expectedCountry: string | null | undefined;
}): boolean {
  if (!selectedId) return false;
  if (
    expectedCountry &&
    selectedCountry &&
    selectedCountry !== expectedCountry
  ) {
    return false;
  }
  return true;
}
