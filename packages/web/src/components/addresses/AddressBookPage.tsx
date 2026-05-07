/**
 * AddressBookPage — Sprint J11.7 Block 6 (ADR-044).
 *
 * Buyer-facing list of saved delivery addresses + add CTA. Empty
 * state, loading state, error state. Used as the page-level component
 * mounted by app/profile/addresses/page.tsx.
 *
 * Wallet gating via `useAccount` — non-connected visitors see the
 * RequireWallet message (cohérent with /orders, /checkout patterns).
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { AddressCard } from "@/components/addresses/AddressCard";
import { AddressFormModal } from "@/components/addresses/AddressFormModal";
import { Button } from "@/components/ui/button";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import {
  useAddresses,
  useDeleteAddress,
  useSetDefaultAddress,
} from "@/hooks/useAddresses";
import { useMinipay } from "@/hooks/useMinipay";
import type { DeliveryAddress } from "@/lib/addresses/api";

export function AddressBookPage() {
  const { address: wallet } = useAccount();
  const { isConnected, isConnecting, isInMinipay } = useMinipay();
  const walletStr = wallet?.toLowerCase();
  const query = useAddresses({
    wallet: walletStr,
    enabled: isConnected,
  });
  const deleteMut = useDeleteAddress({ wallet: walletStr });
  const setDefaultMut = useSetDefaultAddress({ wallet: walletStr });

  const [editing, setEditing] = useState<DeliveryAddress | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Connection states aligned with MiniPay best practices (CLAUDE.md
  // rule 7) — same pattern as /orders.
  if (isConnecting) {
    return (
      <main id="main" className="min-h-screen">
        <div className="p-8 text-center text-base">Connecting to MiniPay…</div>
      </main>
    );
  }
  if (!isConnected && !isInMinipay) {
    return (
      <main id="main" className="min-h-screen">
        <div className="p-8 text-center text-base">
          Please open this app from MiniPay to connect to your wallet.
        </div>
      </main>
    );
  }
  if (!walletStr) {
    return (
      <main id="main" className="min-h-screen">
        <div className="p-8 text-center text-base">
          Unable to connect. Please reopen MiniPay and try again.
        </div>
      </main>
    );
  }

  const addresses = query.data?.items ?? [];
  const pending = deleteMut.isPending || setDefaultMut.isPending;

  const handleEdit = (a: DeliveryAddress) => {
    setEditing(a);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const handleDelete = async (a: DeliveryAddress) => {
    try {
      await deleteMut.mutateAsync(a.id);
      toast.success("Address removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleSetDefault = async (a: DeliveryAddress) => {
    try {
      await setDefaultMut.mutateAsync(a.id);
      toast.success("Default updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <main id="main" className="min-h-screen">
      <section className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-display text-celo-dark dark:text-celo-light">
              My addresses
            </h1>
            <p className="text-sm text-neutral-700">
              Save 1–3 delivery addresses to speed up checkout.
            </p>
          </div>
          <Button
            type="button"
            onClick={handleAdd}
            data-testid="addresses-add-cta"
            className="min-h-[44px]"
          >
            Add address
          </Button>
        </header>

        {query.isLoading ? (
          <div className="space-y-3" data-testid="addresses-loading">
            <SkeletonV5 className="h-32 w-full" />
            <SkeletonV5 className="h-32 w-full" />
          </div>
        ) : query.isError ? (
          <div
            role="alert"
            data-testid="addresses-error"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            Could not load your addresses : {query.error.message}
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => query.refetch()}
                className="min-h-[44px]"
              >
                Retry
              </Button>
            </div>
          </div>
        ) : addresses.length === 0 ? (
          <div
            data-testid="addresses-empty"
            className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center"
          >
            <p className="mb-4 text-base text-neutral-700">
              No addresses saved yet. Add one to make checkout faster.
            </p>
            <Button
              type="button"
              onClick={handleAdd}
              className="min-h-[44px]"
            >
              Add your first address
            </Button>
          </div>
        ) : (
          <div className="space-y-3" data-testid="addresses-list">
            {addresses.map((a) => (
              <AddressCard
                key={a.id}
                address={a}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onSetDefault={handleSetDefault}
                disabled={pending}
              />
            ))}
          </div>
        )}

        <AddressFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          wallet={walletStr}
          address={editing}
        />
      </section>
    </main>
  );
}
