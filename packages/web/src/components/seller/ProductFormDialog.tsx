"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactElement,
} from "react";
import { toast } from "sonner";

import { ImageUploader } from "@/components/seller/ImageUploader";
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
  createProduct,
  ProductSlugConflictError,
  updateProduct,
  type ProductCreate,
  type ProductDetail,
  type ProductUpdate,
} from "@/lib/seller-api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string;
  mode: "create" | "edit";
  initialProduct?: ProductDetail | null;
  onSuccess: () => void;
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;
type StatusValue = "draft" | "active" | "paused";

interface FieldErrors {
  title?: string;
  slug?: string;
  description?: string;
  priceUsdt?: string;
  stock?: string;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  walletAddress,
  mode,
  initialProduct,
  onSuccess,
}: Props) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [priceUsdt, setPriceUsdt] = useState("");
  const [stock, setStock] = useState("");
  const [status, setStatus] = useState<StatusValue>("draft");
  const [imageHashes, setImageHashes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initialProduct) {
      setTitle(initialProduct.title);
      setSlug(initialProduct.slug);
      setDescription(initialProduct.description ?? "");
      setPriceUsdt(initialProduct.price_usdt);
      setStock(String(initialProduct.stock));
      const initialStatus = initialProduct.status as StatusValue;
      setStatus(
        ["draft", "active", "paused"].includes(initialStatus)
          ? initialStatus
          : "draft",
      );
      setImageHashes(initialProduct.image_ipfs_hashes ?? []);
    } else {
      setTitle("");
      setSlug("");
      setDescription("");
      setPriceUsdt("");
      setStock("");
      setStatus("draft");
      setImageHashes([]);
    }
    setErrors({});
  }, [open, mode, initialProduct]);

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (!title.trim()) errs.title = "Title is required";
    else if (title.length > 200) errs.title = "Title too long (max 200)";
    if (mode === "create") {
      if (!slug.trim()) errs.slug = "Slug is required";
      else if (!SLUG_PATTERN.test(slug))
        errs.slug = "Slug: lowercase letters, numbers, dashes only";
    }
    if (description.length > 2000)
      errs.description = "Description too long (max 2000)";
    const price = Number(priceUsdt);
    if (!priceUsdt || Number.isNaN(price) || price <= 0)
      errs.priceUsdt = "Price must be greater than 0";
    const stockNum = Number(stock);
    if (
      stock === "" ||
      Number.isNaN(stockNum) ||
      stockNum < 0 ||
      !Number.isInteger(stockNum)
    ) {
      errs.stock = "Stock must be a non-negative integer";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (mode === "create") {
        const payload: ProductCreate = {
          title,
          slug,
          description: description || null,
          price_usdt: priceUsdt,
          stock: Number(stock),
          status,
          image_ipfs_hashes: imageHashes,
        };
        await createProduct(walletAddress, payload);
        toast.success("Product created");
      } else {
        if (!initialProduct) return;
        const payload: ProductUpdate = {
          title,
          description: description || null,
          price_usdt: priceUsdt,
          stock: Number(stock),
          status,
          image_ipfs_hashes: imageHashes,
        };
        await updateProduct(walletAddress, initialProduct.id, payload);
        toast.success("Product updated");
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ProductSlugConflictError) {
        setErrors((prev) => ({
          ...prev,
          slug: "A product with this slug already exists",
        }));
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to save product",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add product" : "Edit product"}
          </DialogTitle>
          {mode === "edit" ? (
            <DialogDescription>
              Slug cannot be changed after creation.
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Title" error={errors.title}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
            />
          </FormField>

          <FormField
            label="Slug"
            error={errors.slug}
            hint={mode === "edit" ? "Locked after creation" : "lowercase, dashes only"}
          >
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              disabled={mode === "edit"}
              className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base disabled:bg-neutral-100 disabled:text-neutral-500"
            />
          </FormField>

          <FormField
            label="Description"
            error={errors.description}
            hint="Optional, up to 2000 chars"
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              className="w-full rounded-md border border-neutral-300 p-2 text-base"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Price (USDT)" error={errors.priceUsdt}>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={priceUsdt}
                onChange={(e) => setPriceUsdt(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
              />
            </FormField>
            <FormField label="Stock" error={errors.stock}>
              <input
                type="number"
                step="1"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
              />
            </FormField>
          </div>

          <FormField label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusValue)}
              className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
            >
              <option value="draft">Draft (not visible to buyers)</option>
              <option value="active">Active (visible & for sale)</option>
              <option value="paused">Paused (hidden temporarily)</option>
            </select>
          </FormField>

          <FormField label="Images" hint="Up to 8 images">
            <ImageUploader
              initialIpfsHashes={imageHashes}
              walletAddress={walletAddress}
              maxImages={8}
              onChange={setImageHashes}
            />
          </FormField>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="min-h-[44px]"
            >
              {submitting
                ? "Saving…"
                : mode === "create"
                  ? "Create product"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// J10-V5 Phase 5 Angle E sub-block E.1.b — WCAG 1.3.1 Info and
// Relationships + 3.3.2 Labels or Instructions. Generates a unique id
// via React 18+ `useId` and injects it onto the single child input,
// then matches the `<label htmlFor={id}>` to it. Screen readers
// announce the label when the field is focused, getByLabelText resolves
// in tests. The cast preserves any explicit `id` prop the caller passed
// (`childIdProp ?? generatedId`) so callers stay flexible.
export function FormField({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactElement<{ id?: string }>;
}) {
  const generatedId = useId();
  const onlyChild = Children.only(children);
  const childId = isValidElement(onlyChild)
    ? (onlyChild.props.id ?? generatedId)
    : generatedId;
  const childWithId = isValidElement(onlyChild)
    ? cloneElement(onlyChild, { id: childId })
    : onlyChild;
  return (
    <div>
      <label
        htmlFor={childId}
        className="mb-1 block text-base font-medium"
      >
        {label}
      </label>
      {childWithId}
      {error ? (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-sm text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}
