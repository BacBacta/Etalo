/**
 * /admin/disputes — wallet-gated triage page for the V1 mainnet Safe
 * signers (ADR-056). Not surfaced in any nav.
 */
"use client";

import { AdminDisputesConsole } from "@/components/admin/AdminDisputesConsole";

export default function AdminDisputesPage() {
  return <AdminDisputesConsole />;
}
