/**
 * CheckoutDeliveryAddressStep — ADR-050 (V1 inline checkout pivot,
 * supersedes the J11.7 picker pattern).
 *
 * Renders an inline delivery-address form on the checkout page itself
 * — no detour to /profile/addresses, no modal. The buyer types the
 * address fresh each checkout (or pre-fills from sessionStorage via
 * the InlineDeliveryAddressForm's "Use last delivery" button).
 *
 * The submitted address is later snapshotted into
 * `Order.delivery_address_snapshot` JSONB by useSequentialCheckout
 * post-fund via setOrderDeliverySnapshotInline.
 *
 * The J11.7 AddressSelectorList + AddressFormModal pieces stay in
 * the codebase (used by the dormant /profile/addresses route, hidden
 * behind NEXT_PUBLIC_ENABLE_ADDRESS_BOOK feature flag).
 */
"use client";

import { useEffect } from "react";

import {
  InlineDeliveryAddressForm,
  isInlineDeliveryFormReady,
  type InlineDeliveryAddressData,
} from "@/components/checkout/InlineDeliveryAddressForm";
import { useBuyerCountry } from "@/hooks/useBuyerCountry";

interface Props {
  wallet: string;
  value: InlineDeliveryAddressData;
  onChange: (value: InlineDeliveryAddressData) => void;
  /** Optional country guard ; when provided, the picked country must
   *  match. Pass the buyer's country (from useBuyerCountry) — V1 intra
   *  scope means seller country == buyer country == address country
   *  (ADR-045). */
  expectedCountry?: string | null;
}

export function CheckoutDeliveryAddressStep({
  wallet,
  value,
  onChange,
  expectedCountry,
}: Props) {
  const buyerCountryQuery = useBuyerCountry({ wallet });
  const defaultCountry =
    expectedCountry ?? buyerCountryQuery.data?.country ?? null;

  // Pre-fill country from buyer profile on first mount if the form is
  // empty AND no sessionStorage entry exists. The form's own
  // useEffect handles the sessionStorage path ; here we only act when
  // the form's country is still empty AFTER its own initialization.
  useEffect(() => {
    if (!defaultCountry) return;
    if (value.country) return;
    onChange({ ...value, country: defaultCountry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCountry]);

  return (
    <section
      data-testid="checkout-delivery-step"
      className="rounded-md border border-neutral-200 bg-neutral-50 p-4"
    >
      <InlineDeliveryAddressForm
        value={value}
        onChange={onChange}
        defaultCountry={defaultCountry}
        expectedCountry={expectedCountry}
      />
    </section>
  );
}

/**
 * Helper for parents to know whether the inline form is fundable.
 * Mirrors the older `isCheckoutAddressReady` API so the CheckoutFlow
 * gate code path stays simple.
 */
export function isCheckoutAddressReady({
  formData,
  expectedCountry,
}: {
  formData: InlineDeliveryAddressData;
  expectedCountry: string | null | undefined;
}): boolean {
  return isInlineDeliveryFormReady(formData, expectedCountry);
}
