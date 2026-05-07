/**
 * AddressFormModal — Sprint J11.7 Block 6 (ADR-044).
 *
 * Add or edit a delivery address. Reuses the shadcn Dialog + the
 * Block 4 CountrySelector. African informal-context-friendly :
 * free-form address line, optional landmark + notes, no postal
 * code validation (ADR-044 V1 scope).
 */
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  CountrySelector,
  type CountryCode,
} from "@/components/CountrySelector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateAddress,
  useUpdateAddress,
} from "@/hooks/useAddresses";
import type {
  DeliveryAddress,
  DeliveryAddressCreate,
} from "@/lib/addresses/api";

interface FormState {
  phone_number: string;
  country: CountryCode | null;
  city: string;
  region: string;
  address_line: string;
  landmark: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  phone_number: "",
  country: null,
  city: "",
  region: "",
  address_line: "",
  landmark: "",
  notes: "",
};

function fromAddress(addr: DeliveryAddress): FormState {
  return {
    phone_number: addr.phone_number,
    country: addr.country,
    city: addr.city,
    region: addr.region,
    address_line: addr.address_line,
    landmark: addr.landmark ?? "",
    notes: addr.notes ?? "",
  };
}

function toPayload(form: FormState): DeliveryAddressCreate {
  return {
    phone_number: form.phone_number.trim(),
    country: form.country!,
    city: form.city.trim(),
    region: form.region.trim(),
    address_line: form.address_line.trim(),
    landmark: form.landmark.trim() ? form.landmark.trim() : null,
    notes: form.notes.trim() ? form.notes.trim() : null,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: string;
  /** When provided, the modal is in edit mode. */
  address?: DeliveryAddress | null;
  onSaved?: (addr: DeliveryAddress) => void;
}

export function AddressFormModal({
  open,
  onOpenChange,
  wallet,
  address,
  onSaved,
}: Props) {
  const isEdit = address != null;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Reset form when reopening (covers edit-then-add or add-then-add).
  useEffect(() => {
    if (open) {
      setForm(address ? fromAddress(address) : EMPTY_FORM);
      setSubmitAttempted(false);
    }
  }, [open, address]);

  const createMut = useCreateAddress({ wallet });
  const updateMut = useUpdateAddress({ wallet });
  const isPending = createMut.isPending || updateMut.isPending;

  const requiredOk =
    form.phone_number.trim().length >= 5 &&
    form.country !== null &&
    form.city.trim().length > 0 &&
    form.region.trim().length > 0 &&
    form.address_line.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (!requiredOk || isPending) return;

    try {
      const payload = toPayload(form);
      const saved = isEdit
        ? await updateMut.mutateAsync({ id: address!.id, payload })
        : await createMut.mutateAsync(payload);
      toast.success(isEdit ? "Address updated" : "Address added");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save address",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit address" : "Add new address"}
          </DialogTitle>
          <DialogDescription>
            We use this to coordinate delivery with your seller.
            Free-form details welcome — landmarks help couriers.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="addr-phone"
              className="mb-1 block text-base font-medium"
            >
              Phone number<span className="ml-0.5 text-red-600">*</span>
            </label>
            <input
              id="addr-phone"
              data-testid="addr-phone"
              type="tel"
              value={form.phone_number}
              onChange={(e) =>
                setForm((p) => ({ ...p, phone_number: e.target.value }))
              }
              placeholder="+234..."
              className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
            />
          </div>
          <CountrySelector
            id="addr-country"
            label="Country"
            value={form.country}
            onChange={(c) => setForm((p) => ({ ...p, country: c }))}
            required
            disabled={isPending}
            data-testid="addr-country"
            error={
              submitAttempted && form.country === null
                ? "Please pick a country"
                : undefined
            }
          />
          <div>
            <label
              htmlFor="addr-city"
              className="mb-1 block text-base font-medium"
            >
              City<span className="ml-0.5 text-red-600">*</span>
            </label>
            <input
              id="addr-city"
              data-testid="addr-city"
              type="text"
              value={form.city}
              onChange={(e) =>
                setForm((p) => ({ ...p, city: e.target.value }))
              }
              className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
            />
          </div>
          <div>
            <label
              htmlFor="addr-region"
              className="mb-1 block text-base font-medium"
            >
              Region / State<span className="ml-0.5 text-red-600">*</span>
            </label>
            <input
              id="addr-region"
              data-testid="addr-region"
              type="text"
              value={form.region}
              onChange={(e) =>
                setForm((p) => ({ ...p, region: e.target.value }))
              }
              className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
            />
          </div>
          <div>
            <label
              htmlFor="addr-line"
              className="mb-1 block text-base font-medium"
            >
              Address details<span className="ml-0.5 text-red-600">*</span>
            </label>
            <textarea
              id="addr-line"
              data-testid="addr-line"
              value={form.address_line}
              onChange={(e) =>
                setForm((p) => ({ ...p, address_line: e.target.value }))
              }
              rows={2}
              placeholder="12 Allen Avenue, Ikeja"
              className="w-full rounded-md border border-neutral-300 p-2 text-base"
            />
          </div>
          <div>
            <label
              htmlFor="addr-landmark"
              className="mb-1 block text-base font-medium"
            >
              Landmark <span className="text-sm text-neutral-500">(optional)</span>
            </label>
            <input
              id="addr-landmark"
              data-testid="addr-landmark"
              type="text"
              value={form.landmark}
              onChange={(e) =>
                setForm((p) => ({ ...p, landmark: e.target.value }))
              }
              placeholder="Near the central pharmacy"
              className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
            />
          </div>
          <div>
            <label
              htmlFor="addr-notes"
              className="mb-1 block text-base font-medium"
            >
              Delivery notes <span className="text-sm text-neutral-500">(optional)</span>
            </label>
            <textarea
              id="addr-notes"
              data-testid="addr-notes"
              value={form.notes}
              onChange={(e) =>
                setForm((p) => ({ ...p, notes: e.target.value }))
              }
              rows={2}
              className="w-full rounded-md border border-neutral-300 p-2 text-base"
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="addr-submit"
              disabled={isPending || !requiredOk}
              className="min-h-[44px]"
            >
              {isPending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Add address"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
