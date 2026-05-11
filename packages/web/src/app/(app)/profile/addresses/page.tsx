/**
 * Buyer address book — /profile/addresses. Sprint J11.7 Block 6 (ADR-044).
 *
 * ADR-050 V1 pivot : the checkout flow now uses an inline delivery
 * form (InlineDeliveryAddressForm) instead of picking from this
 * address book. The whole route is gated behind
 * NEXT_PUBLIC_ENABLE_ADDRESS_BOOK so V1 buyers don't navigate to a
 * dead-end. Set the flag to "true" to re-expose for V1.5 power-user
 * testing or staging walkthroughs.
 *
 * Wallet-gated via the AddressBookPage component (which renders
 * RequireWallet on the disconnected branch).
 */
"use client";

import { notFound } from "next/navigation";

import { AddressBookPage } from "@/components/addresses/AddressBookPage";

const ADDRESS_BOOK_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_ADDRESS_BOOK === "true";

export default function AddressesPage() {
  if (!ADDRESS_BOOK_ENABLED) {
    notFound();
  }
  return <AddressBookPage />;
}
