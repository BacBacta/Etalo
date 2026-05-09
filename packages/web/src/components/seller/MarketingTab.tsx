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
  // Caption language : V1 ships English-only. Swahili was the only
  // non-English option but doesn't fit the 4-market V1 scope (NGA /
  // GHA / KEN / ZAF — Swahili is local in KEN only ; NGA = Yoruba/
  // Igbo/Hausa, GHA = Twi, ZAF = Zulu/Xhosa). Surfacing one African
  // language while ignoring the others is a worse signal than English
  // common-denominator. Multi-lang revival = V1.5+ scope with
  // seller.country auto-detection.
  const captionLang = "en" as const;
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateImageResponse | null>(null);

  const canGenerate =
    !!address &&
    !!selectedProduct &&
    !!selectedTemplate &&
    !generating &&
    balance >= 1;

  // Surface the precise blocker so the disabled CTA isn't a black box.
  // Order matters : credits first (most actionable), then product,
  // then template (the "Choose template" grid lives furthest down).
  let generateHint: string | null = null;
  if (balance < 1) {
    generateHint =
      "You need at least 1 credit to generate. Tap “Buy more” above.";
  } else if (!selectedProduct) {
    generateHint = "Select a product to generate.";
  } else if (!selectedTemplate) {
    generateHint = "Choose a template to generate.";
  }

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

      {/* Caption language toggle removed V1. Swahili was the only
          non-English option but mismatches the 4-market scope (NGA /
          GHA / KEN / ZAF). Multi-language support returns V1.5+ tied
          to seller.country auto-detection. The captionLang variable
          is hardcoded "en" upstream so existing GenerateImage payload
          shape is preserved. */}

      <Button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={!canGenerate}
        className="min-h-[44px] w-full"
        data-testid="generate-btn"
      >
        {generating
          ? "Generating… (5–10s)"
          : "Generate marketing pack (1 credit · 0.15 USDT)"}
      </Button>

      {/* Surface the disable reason. Replaces the generic
          "insufficient-credits-hint" with a dynamic message that
          covers all three blockers (no credits / no product / no
          template) so the seller never wonders why the CTA is grey. */}
      {!generating && generateHint ? (
        <p
          className="text-center text-sm text-neutral-600 dark:text-neutral-400"
          data-testid="generate-hint"
        >
          {generateHint}
        </p>
      ) : null}

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
        // Empty state — the helper text "Pick a product, choose a
        // template, and generate..." was redundant with the form
        // sitting directly above and is dropped (screenshot bug).
        <EmptyStateV5
          illustration="no-marketing"
          title="No assets generated yet"
          description="Your generated visuals will appear here."
        />
      )}
    </div>
  );
}
