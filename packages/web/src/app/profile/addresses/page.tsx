/**
 * Buyer address book — /profile/addresses. Sprint J11.7 Block 6 (ADR-044).
 *
 * Lists the connected buyer's saved delivery addresses with add /
 * edit / delete / set-default flows. Wallet-gated via the
 * AddressBookPage component (which renders RequireWallet on the
 * disconnected branch).
 */
"use client";

import { AddressBookPage } from "@/components/addresses/AddressBookPage";

export default function AddressesPage() {
  return <AddressBookPage />;
}
