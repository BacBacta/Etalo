/**
 * OnboardingStepProduct — second (and final) step of the seller
 * onboarding wizard. Collects the seller's first product (title,
 * price, stock, photos, optional description). The wizard parent
 * combines this with the boutique step's values and POSTs the whole
 * payload to /api/v1/onboarding/complete in one atomic transaction.
 *
 * At least one photo is required by the backend schema
 * (photo_ipfs_hashes min_length=1) so the submit button stays
 * disabled until ImageUploader has at least one successful upload.
 */
"use client";

import { useMemo, useState } from "react";

import { ImageUploader } from "@/components/seller/ImageUploader";
import { Button } from "@/components/ui/button";

export interface ProductValues {
  title: string;
  description: string;
  price_usdt: string;
  stock: number;
  photo_ipfs_hashes: string[];
}

interface Props {
  walletAddress: string;
  initial?: ProductValues;
  isSubmitting: boolean;
  onBack: () => void;
  onSubmit: (values: ProductValues) => void;
}

const PRICE_PATTERN = /^\d+([.,]\d{1,2})?$/;
const TITLE_MIN = 3;
const TITLE_MAX = 200;
const STOCK_MIN = 1;
const STOCK_MAX = 10000;

function normalizePrice(input: string): string {
  // Backend wants a decimal with `.`; users may type "12,5" in
  // FR/Africa locales. Replace once, drop trailing zeros to keep
  // the JSON payload tidy.
  return input.replace(",", ".").trim();
}

export function OnboardingStepProduct({
  walletAddress,
  initial,
  isSubmitting,
  onBack,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceRaw, setPriceRaw] = useState(initial?.price_usdt ?? "");
  const [stock, setStock] = useState(initial?.stock ?? 1);
  const [photos, setPhotos] = useState<string[]>(
    initial?.photo_ipfs_hashes ?? [],
  );

  const priceValid = useMemo(
    () => PRICE_PATTERN.test(priceRaw.trim()),
    [priceRaw],
  );

  const canSubmit = useMemo(() => {
    if (title.trim().length < TITLE_MIN || title.length > TITLE_MAX) return false;
    if (!priceValid) return false;
    if (Number.isNaN(stock) || stock < STOCK_MIN || stock > STOCK_MAX) return false;
    if (photos.length === 0) return false;
    if (description.length > 500) return false;
    return true;
  }, [title, priceValid, stock, photos, description]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      price_usdt: normalizePrice(priceRaw),
      stock,
      photo_ipfs_hashes: photos,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="product-title" className="mb-1 block text-sm font-medium">
          Product title
        </label>
        <input
          id="product-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          minLength={TITLE_MIN}
          placeholder="Handmade leather bag"
          required
          className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base focus:border-celo-forest focus:outline-none focus:ring-1 focus:ring-celo-forest"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="product-price" className="mb-1 block text-sm font-medium">
            Price (USDT)
          </label>
          <input
            id="product-price"
            type="text"
            inputMode="decimal"
            value={priceRaw}
            onChange={(e) => setPriceRaw(e.target.value)}
            placeholder="12.50"
            required
            aria-invalid={priceRaw.length > 0 && !priceValid}
            className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base tabular-nums focus:border-celo-forest focus:outline-none focus:ring-1 focus:ring-celo-forest"
          />
          {priceRaw.length > 0 && !priceValid ? (
            <p className="mt-1 text-sm text-red-600">
              Use digits only, e.g. 12.50
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="product-stock" className="mb-1 block text-sm font-medium">
            Stock
          </label>
          <input
            id="product-stock"
            type="number"
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(parseInt(e.target.value, 10) || 0)}
            min={STOCK_MIN}
            max={STOCK_MAX}
            step={1}
            required
            className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base tabular-nums focus:border-celo-forest focus:outline-none focus:ring-1 focus:ring-celo-forest"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="product-description"
          className="mb-1 block text-sm font-medium"
        >
          Description <span className="text-neutral-500">(optional)</span>
        </label>
        <textarea
          id="product-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Materials, sizes, what makes it special…"
          className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base focus:border-celo-forest focus:outline-none focus:ring-1 focus:ring-celo-forest"
        />
        <p className="mt-1 text-sm text-neutral-500">
          {description.length}/500
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Photos <span className="text-red-600">*</span>
        </label>
        <ImageUploader
          walletAddress={walletAddress}
          maxImages={5}
          initialIpfsHashes={photos}
          onChange={setPhotos}
        />
        <p className="mt-1 text-sm text-neutral-500">
          At least 1 photo is required. Up to 5 total.
        </p>
      </div>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isSubmitting}
          data-testid="onboarding-step-product-back"
          className="sm:flex-1"
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={!canSubmit || isSubmitting}
          data-testid="onboarding-step-product-submit"
          className="sm:flex-[2]"
        >
          {isSubmitting ? "Creating your boutique…" : "Create my boutique"}
        </Button>
      </div>
    </form>
  );
}
