"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteProduct } from "@/lib/seller-api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string;
  product: { id: string; title: string } | null;
  onSuccess: () => void;
}

export function DeleteProductDialog({
  open,
  onOpenChange,
  walletAddress,
  product,
  onSuccess,
}: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!product) return;
    setDeleting(true);
    try {
      await deleteProduct(walletAddress, product.id);
      toast.success("Product deleted");
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete product?</DialogTitle>
          <DialogDescription>
            &ldquo;{product?.title}&rdquo; will be removed from your shop.
            Items in active orders won&apos;t be affected, but the product
            won&apos;t be visible to buyers anymore.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="min-h-[44px] bg-red-600 text-white hover:bg-red-700"
          >
            {deleting ? "Deleting…" : "Delete product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
