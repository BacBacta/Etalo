"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { ShareButtons } from "@/components/seller/marketing/ShareButtons";
import {
  generateCaption,
  type GenerateImageResponse,
} from "@/lib/marketing-api";

interface Props {
  result: GenerateImageResponse;
  productId: string;
  productTitle: string;
  /** Initial language from the originating /generate-image call. The
   * first caption is reused for that language; switching to the other
   * triggers a /generate-caption regenerate (no extra credit — it's a
   * caption-only call, not a render). */
  initialLang: "en" | "sw";
}

export function GeneratedAssets({
  result,
  productId,
  productTitle,
  initialLang,
}: Props) {
  const { address } = useAccount();
  const [captionEn, setCaptionEn] = useState<string | null>(
    initialLang === "en" ? result.caption : null,
  );
  const [captionSw, setCaptionSw] = useState<string | null>(
    initialLang === "sw" ? result.caption : null,
  );
  const [activeLang, setActiveLang] = useState<"en" | "sw">(initialLang);
  const [regenerating, setRegenerating] = useState(false);

  const switchLang = async (target: "en" | "sw") => {
    if (activeLang === target) return;
    const cached = target === "en" ? captionEn : captionSw;
    if (cached) {
      setActiveLang(target);
      return;
    }
    if (!address) return;
    setRegenerating(true);
    try {
      const r = await generateCaption(address, {
        product_id: productId,
        lang: target,
      });
      if (target === "en") setCaptionEn(r.caption);
      else setCaptionSw(r.caption);
      setActiveLang(target);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Failed to generate ${target.toUpperCase()} caption`,
      );
    } finally {
      setRegenerating(false);
    }
  };

  const downloadImage = () => {
    const link = document.createElement("a");
    link.href = result.image_url;
    link.download = `etalo-${productTitle
      .replace(/\s+/g, "-")
      .toLowerCase()}-${result.template}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentCaption =
    activeLang === "en" ? (captionEn ?? "") : (captionSw ?? "");

  return (
    <div
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4"
      data-testid="generated-assets"
    >
      <h3 className="text-lg font-semibold">Generated marketing pack</h3>

      <div className="relative mx-auto aspect-square max-w-md overflow-hidden rounded-md bg-neutral-100">
        <Image
          src={result.image_url}
          alt="Generated marketing image"
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-contain"
          unoptimized
        />
      </div>

      <div>
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => void switchLang("en")}
            disabled={regenerating}
            data-testid="caption-lang-en"
            aria-pressed={activeLang === "en"}
            className={`rounded-md px-3 py-1 text-sm disabled:opacity-50 ${
              activeLang === "en"
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-700"
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => void switchLang("sw")}
            disabled={regenerating}
            data-testid="caption-lang-sw"
            aria-pressed={activeLang === "sw"}
            className={`rounded-md px-3 py-1 text-sm disabled:opacity-50 ${
              activeLang === "sw"
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {regenerating && activeLang !== "sw" ? "Loading…" : "Swahili"}
          </button>
        </div>
        <textarea
          value={currentCaption}
          onChange={(e) => {
            if (activeLang === "en") setCaptionEn(e.target.value);
            else setCaptionSw(e.target.value);
          }}
          rows={4}
          className="w-full rounded-md border border-neutral-300 p-2 text-base"
          data-testid="caption-textarea"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={downloadImage}
          className="min-h-[44px]"
          data-testid="download-image-btn"
        >
          <DownloadSimple className="mr-2 h-4 w-4" aria-hidden />
          Download image
        </Button>
        <ShareButtons imageUrl={result.image_url} caption={currentCaption} />
      </div>
    </div>
  );
}
