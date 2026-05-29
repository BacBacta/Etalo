/**
 * /mediator — wallet-gated route for approved N2/N3 mediators (ADR-056).
 *
 * Not surfaced in any nav. Mediators are pointed here off-app. The
 * console itself decides what to render based on the connected wallet's
 * on-chain `isMediatorApproved` status.
 */
"use client";

import { MediatorConsole } from "@/components/mediator/MediatorConsole";

export default function MediatorPage() {
  return <MediatorConsole />;
}
