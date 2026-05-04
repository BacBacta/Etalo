"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { CreditsBalance } from "@/components/seller/marketing/CreditsBalance";
import { GeneratedAssets } from "@/components/seller/marketing/GeneratedAssets";
import { ProductPicker } from "@/components/seller/marketing/ProductPicker";
import {
  TemplateSelector,
  type TemplateKey,
} from "@/components/seller/marketing/TemplateSelector";
import { Button } from "@/components/ui/button";
import { EmptyStateV5 } from "@/components/ui/v5/EmptyState";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import { useCreditsBalance } from "@/hooks/useCreditsBalance";
import { fireMilestone } from "@/lib/confetti/milestones";
import {
  generateImage,
  InsufficientCreditsError,
  type GenerateImageResponse,
} from "@/lib/marketing-api";
import type { MyProductsListItem } from "@/lib/seller-api";

export function MarketingTab() {
  const { address } = useAccount();
  const creditsQuery = useCreditsBalance();
  const balance = creditsQuery.data?.balance ?? 0;
  const refetchBalance = creditsQuery.refetch;

  const [selectedProduct, setSelectedProduct] =
    useState<MyProductsListItem | null>(null);
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateKey | null>(null);
  const [captionLang, setCaptionLang] = useState<"en" | "sw">("en");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateImageResponse | null>(null);

  const canGenerate =
    !!address &&
    !!selectedProduct &&
    !!selectedTemplate &&
    !generating &&
    balance >= 1;

  const handleGenerate = async () => {
    if (!address || !selectedProduct || !selectedTemplate) return;
    setGenerating(true);
    setResult(null);
    try {
      const r = await generateImage(address, {
        product_id: selectedProduct.id,
        template: selectedTemplate,
        caption_lang: captionLang,
      });
      setResult(r);
      await refetchBalance();
      // J10-V5 Block 7 — subtle 30-particle burst (scalar 0.8) for the
      // routine creative win; not as loud as a sale or withdrawal.
      fireMilestone("image-generated");
      toast.success("Marketing image generated!");
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        toast.error(
          "Not enough credits. Buy more credits flow lands in Block 7b.",
        );
        await refetchBalance();
      } else {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <CreditsBalance />

      <ProductPicker
        selected={selectedProduct}
        onSelect={(p) => {
          setSelectedProduct(p);
          // Drop the previous result when the input changes — the
          // displayed image no longer matches the picker state.
          setResult(null);
        }}
      />

      <TemplateSelector
        selected={selectedTemplate}
        onSelect={(t) => {
          setSelectedTemplate(t);
          setResult(null);
        }}
      />

      <div className="space-y-2">
        <label className="block text-base font-medium">Caption language</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCaptionLang("en")}
            data-testid="lang-toggle-en"
            aria-pressed={captionLang === "en"}
            className={`min-h-[44px] rounded-md px-4 py-2 text-base ${
              captionLang === "en"
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-700"
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setCaptionLang("sw")}
            data-testid="lang-toggle-sw"
            aria-pressed={captionLang === "sw"}
            className={`min-h-[44px] rounded-md px-4 py-2 text-base ${
              captionLang === "sw"
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-700"
            }`}
          >
            Swahili
          </button>
        </div>
      </div>

      <Button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={!canGenerate}
        className="min-h-[44px] w-full"
        data-testid="generate-btn"
      >
        {generating
          ? "Generating… (5–10s)"
          : "Generate marketing pack (1 credit)"}
      </Button>

      {balance < 1 && (
        <p
          className="text-center text-sm text-neutral-600"
          data-testid="insufficient-credits-hint"
        >
          You need at least 1 credit to generate. Purchase more credits
          (Block 7b).
        </p>
      )}

      {generating && !result && (
        <div
          className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4"
          data-testid="marketing-skeleton"
        >
          <SkeletonV5
            variant="rectangle"
            className="aspect-square max-w-md mx-auto"
          />
          <SkeletonV5 variant="text-multi" className="max-w-md mx-auto" />
        </div>
      )}

      {result && selectedProduct && (
        <GeneratedAssets
          result={result}
          productId={selectedProduct.id}
          productTitle={selectedProduct.title}
          initialLang={captionLang}
        />
      )}

      {!generating && !result && (
        <EmptyStateV5
          illustration="no-marketing"
          title="No assets generated yet"
          description="Pick a product, choose a template, and generate marketing visuals using the form above."
        />
      )}
    </div>
  );
}
