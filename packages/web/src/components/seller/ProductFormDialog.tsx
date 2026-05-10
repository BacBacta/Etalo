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
  CATEGORY_OPTIONS,
  categoryLabel,
  isValidCategoryCode,
  type CategoryCode,
} from "@/lib/categories";
import {
  createProduct,
  enhanceImageVariants,
  InsufficientCreditsForEnhanceError,
  ProductSlugConflictError,
  updateProduct,
  type EnhanceVariant,
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
const TITLE_MIN_LENGTH = 3;
type StatusValue = "draft" | "active" | "paused";

/**
 * Slugify a free-form title into a marketplace-safe slug. Lowercase,
 * strip diacritics, collapse non-alphanumeric runs into single
 * dashes, trim leading/trailing dashes. Empty input → empty string
 * so the caller can use it as the "current slug" without dancing
 * around an "is the user typing?" race.
 */
function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

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
  // `slugManuallyEdited` decides whether the slug auto-tracks the
  // title. Once the user types a single character into the slug field
  // directly, we stop the auto-sync — they own the slug from then on.
  // Reset whenever the dialog re-opens.
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [priceUsdt, setPriceUsdt] = useState("");
  const [stock, setStock] = useState("");
  const [status, setStatus] = useState<StatusValue>("draft");
  const [imageHashes, setImageHashes] = useState<string[]>([]);
  // Default to "other" rather than null — the buyer-facing category
  // filter is most useful when every active product is bucketed
  // somewhere. "Other" makes the bucket explicit when the seller
  // doesn't fit a named category.
  const [category, setCategory] = useState<CategoryCode>("other");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  // ADR-049 Block C — enhance photo state machine.
  // - phase "idle": the form's hero photo has not been enhanced this session
  // - phase "loading": API call in flight
  // - phase "preview": variants returned, the seller is picking one
  //   (Recommended / White bright / Neutral cool) — or rejecting all
  //   to keep the original. Credit is already consumed.
  // - phase "used": the seller picked a variant ; image_ipfs_hashes[0]
  //   was swapped to it.
  // Reset on dialog re-open.
  type EnhancePhase = "idle" | "loading" | "preview" | "used";
  const [enhancePhase, setEnhancePhase] = useState<EnhancePhase>("idle");
  // Hash of the seller's original photo, captured just before we call
  // /enhance-image-variants so we can offer "Keep original" in the
  // preview step.
  const [originalHashAtEnhance, setOriginalHashAtEnhance] = useState<
    string | null
  >(null);
  const [enhanceVariants, setEnhanceVariants] = useState<
    EnhanceVariant[] | null
  >(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initialProduct) {
      setTitle(initialProduct.title);
      setSlug(initialProduct.slug);
      // Edit mode : slug is locked anyway, but mark as manually-set so
      // a Title edit doesn't try to overwrite it (defense-in-depth ;
      // the input is also disabled).
      setSlugManuallyEdited(true);
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
      setCategory(
        isValidCategoryCode(initialProduct.category)
          ? initialProduct.category
          : "other",
      );
    } else {
      setTitle("");
      setSlug("");
      setSlugManuallyEdited(false);
      setDescription("");
      setPriceUsdt("");
      setStock("");
      setStatus("draft");
      setImageHashes([]);
      setCategory("other");
    }
    setErrors({});
    setEnhancePhase("idle");
    setOriginalHashAtEnhance(null);
    setEnhanceVariants(null);
  }, [open, mode, initialProduct]);

  const heroHash = imageHashes[0] ?? null;
  const canEnhance =
    heroHash !== null && enhancePhase === "idle";

  const handleEnhance = async () => {
    if (!heroHash) return;
    setEnhancePhase("loading");
    setOriginalHashAtEnhance(heroHash);
    try {
      const result = await enhanceImageVariants(
        walletAddress,
        heroHash,
        category,
      );
      // Credit consumed server-side. Stash the variants and flip into
      // preview phase — image_ipfs_hashes[0] stays on the original
      // until the seller picks a variant.
      setEnhanceVariants(result.variants);
      setEnhancePhase("preview");
      toast.success(
        `3 variants ready · ${result.credits_remaining} credits left · pick one below`,
      );
    } catch (err) {
      setEnhancePhase("idle");
      setOriginalHashAtEnhance(null);
      if (err instanceof InsufficientCreditsForEnhanceError) {
        toast.error("Not enough credits to enhance. Buy more from your dashboard.");
      } else {
        toast.error(
          err instanceof Error ? err.message : "Photo enhancement failed",
        );
      }
    }
  };

  const handleUseVariant = (variant: EnhanceVariant) => {
    setImageHashes((prev) => [variant.ipfs_hash, ...prev.slice(1)]);
    setEnhancePhase("used");
  };

  const handleKeepOriginal = () => {
    // The credit was already consumed but the seller doesn't like any
    // variant — go back to the original photo. Don't refund (work was
    // done, all 3 variants pinned) but make it easy to move on.
    setEnhancePhase("idle");
    setEnhanceVariants(null);
    setOriginalHashAtEnhance(null);
  };

  const handleTitleChange = (next: string) => {
    setTitle(next);
    // Auto-derive the slug while the user hasn't taken ownership of
    // the slug field yet. Frees the seller from having to think about
    // URL formatting on top of the title — most just want to type
    // "Robe wax M" and ship.
    if (mode === "create" && !slugManuallyEdited) {
      setSlug(slugify(next));
    }
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) errs.title = "Title is required";
    else if (trimmedTitle.length < TITLE_MIN_LENGTH)
      errs.title = `Title must be at least ${TITLE_MIN_LENGTH} characters`;
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
          category,
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
          category,
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
              onChange={(e) => handleTitleChange(e.target.value)}
              minLength={TITLE_MIN_LENGTH}
              maxLength={200}
              className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
            />
          </FormField>

          <FormField
            label="Slug"
            error={errors.slug}
            hint={
              mode === "edit"
                ? "Locked after creation"
                : "Auto-generated from title — edit to override"
            }
          >
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugManuallyEdited(true);
              }}
              disabled={mode === "edit"}
              className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark disabled:bg-neutral-100 disabled:text-neutral-500 dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light dark:disabled:bg-celo-dark-bg dark:disabled:text-celo-light/40"
            />
          </FormField>

          <FormField label="Description" error={errors.description}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={
                'Include size info, e.g. "Available in S, M, L" or "Sizes EU 36-44".'
              }
              className="w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark placeholder:text-neutral-400 dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light dark:placeholder:text-neutral-500"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Price (USDT)" error={errors.priceUsdt}>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="10.00"
                value={priceUsdt}
                onChange={(e) => setPriceUsdt(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark placeholder:text-neutral-400 dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light dark:placeholder:text-neutral-500"
              />
            </FormField>
            <FormField label="Stock" error={errors.stock}>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="10"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark placeholder:text-neutral-400 dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light dark:placeholder:text-neutral-500"
              />
            </FormField>
          </div>

          {/* Category — bucket the product so the marketplace filter
              chips can target it. Default "other" keeps every product
              bucketed (the buyer-facing chips assume non-null). */}
          <FormField
            label="Category"
            hint='Pick "Other" if no category fits.'
          >
            <select
              aria-label="Product category"
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryCode)}
              data-testid="product-form-category"
              className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Status">
            <select
              aria-label="Product status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusValue)}
              className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white p-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light"
            >
              <option value="draft">Draft (not visible to buyers)</option>
              <option value="active">Active (visible & for sale)</option>
              <option value="paused">Paused (hidden temporarily)</option>
            </select>
          </FormField>

          {/* Image upload — drop the FormField hint "Up to 8 images" :
              ImageUploader renders its own "Up to 8 images. JPEG, PNG,
              or WebP. Max 5 MB each." helper internally, the FormField
              hint was a dupe (screenshot bug). */}
          <FormField label="Images">
            <ImageUploader
              initialIpfsHashes={imageHashes}
              walletAddress={walletAddress}
              maxImages={8}
              onChange={setImageHashes}
            />
          </FormField>

          {/* ADR-049 — V1 photo enhancement. Visible only after the
              seller uploads at least one image. State machine:
              idle → loading → preview → used (or back to idle on revert).
              Credit is consumed at the API call (loading→preview); the
              preview phase only decides whether to swap imageHashes[0]
              to the enhanced version or keep the original. */}
          {heroHash ? (
            <EnhanceSection
              phase={enhancePhase}
              originalHash={originalHashAtEnhance ?? heroHash}
              variants={enhanceVariants}
              canEnhance={canEnhance}
              onEnhance={handleEnhance}
              onUseVariant={handleUseVariant}
              onKeepOriginal={handleKeepOriginal}
            />
          ) : null}

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

// ADR-049 — Inline UI for the photo-enhance flow. State-driven so the
// section morphs through idle → loading → preview → used without nested
// modals (less visual noise on mobile, no double-modality with the
// surrounding ProductFormDialog).
const PINATA_GATEWAY_FOR_PREVIEW = "https://gateway.pinata.cloud/ipfs/";

function EnhanceSection({
  phase,
  originalHash,
  variants,
  canEnhance,
  onEnhance,
  onUseVariant,
  onKeepOriginal,
}: {
  phase: "idle" | "loading" | "preview" | "used";
  originalHash: string;
  variants: EnhanceVariant[] | null;
  canEnhance: boolean;
  onEnhance: () => void;
  onUseVariant: (variant: EnhanceVariant) => void;
  onKeepOriginal: () => void;
}) {
  const wrapperClass =
    "rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-celo-light/20 dark:bg-celo-dark-elevated";

  if (phase === "preview" && variants && variants.length > 0) {
    return (
      <div className={wrapperClass}>
        <p className="mb-1 text-base font-medium text-celo-dark dark:text-celo-light">
          Pick a backdrop you like
        </p>
        <p className="mb-3 text-sm text-neutral-500 dark:text-celo-light/60">
          1 credit was used to generate {variants.length} variants. Choosing
          &quot;Keep original&quot; doesn&apos;t refund the credit.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <figure className="overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-celo-light/20">
            <img
              src={`${PINATA_GATEWAY_FOR_PREVIEW}${originalHash}`}
              alt="Original photo"
              className="aspect-square w-full object-cover"
            />
            <figcaption className="px-2 py-1 text-center text-sm text-neutral-500">
              Original
            </figcaption>
            <button
              type="button"
              onClick={onKeepOriginal}
              className="block w-full border-t border-neutral-200 bg-neutral-50 py-2 text-sm font-medium text-celo-dark hover:bg-neutral-100 dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light dark:hover:bg-celo-dark-bg"
            >
              Keep this
            </button>
          </figure>
          {variants.map((v) => (
            <figure
              key={v.ipfs_hash}
              className="overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-celo-light/20"
            >
              <img
                src={v.image_url}
                alt={`${v.label} variant`}
                className="aspect-square w-full object-cover"
              />
              <figcaption className="px-2 py-1 text-center text-sm text-neutral-500">
                {v.label}
              </figcaption>
              <button
                type="button"
                onClick={() => onUseVariant(v)}
                className="block w-full border-t border-neutral-200 bg-celo-dark py-2 text-sm font-medium text-white hover:bg-celo-dark/90 dark:border-celo-light/20"
              >
                Use this
              </button>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-medium text-celo-dark dark:text-celo-light">
            {phase === "used"
              ? "✨ Photo enhanced"
              : "Make this photo look pro"}
          </p>
          <p className="text-sm text-neutral-500 dark:text-celo-light/60">
            {phase === "used"
              ? "Background removed, studio backdrop applied."
              : "AI generates 3 backdrop variants — pick the one that fits."}
          </p>
        </div>
        {phase !== "used" ? (
          <Button
            type="button"
            onClick={onEnhance}
            disabled={!canEnhance}
            className="min-h-[44px] shrink-0"
          >
            {phase === "loading" ? "Generating…" : "Enhance · 1 credit"}
          </Button>
        ) : null}
      </div>
    </div>
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
