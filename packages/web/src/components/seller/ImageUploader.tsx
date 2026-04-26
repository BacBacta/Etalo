"use client";

import { AlertCircle, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { uploadImage } from "@/lib/seller-api";

interface Props {
  initialIpfsHashes?: string[];
  walletAddress: string;
  maxImages?: number;
  onChange: (hashes: string[]) => void;
}

interface ImageState {
  id: string;
  status: "uploading" | "success" | "error";
  preview: string;
  ipfsHash?: string;
  errorMessage?: string;
}

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export function ImageUploader({
  initialIpfsHashes = [],
  walletAddress,
  maxImages = 8,
  onChange,
}: Props) {
  const [images, setImages] = useState<ImageState[]>(() =>
    initialIpfsHashes.map((hash) => ({
      id: hash,
      status: "success" as const,
      preview: `${PINATA_GATEWAY}${hash}`,
      ipfsHash: hash,
    })),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notifyParent = (next: ImageState[]) => {
    const hashes = next
      .filter((i) => i.status === "success" && i.ipfsHash)
      .map((i) => i.ipfsHash as string);
    onChange(hashes);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) return;

    const filesArray = Array.from(files).slice(0, remainingSlots);

    // Build entries with previews + uploading status, then commit to state.
    const entries = await Promise.all(
      filesArray.map(async (file) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        const preview = await readFileAsDataURL(file);
        return { id, file, preview };
      }),
    );

    const initialEntries: ImageState[] = entries.map((e) => ({
      id: e.id,
      status: "uploading",
      preview: e.preview,
    }));
    setImages((prev) => [...prev, ...initialEntries]);

    // Upload each in parallel — successes notify the parent as they land.
    for (const entry of entries) {
      uploadImage(walletAddress, entry.file)
        .then((response) => {
          setImages((prev) => {
            const next = prev.map((img) =>
              img.id === entry.id
                ? {
                    ...img,
                    status: "success" as const,
                    ipfsHash: response.ipfs_hash,
                  }
                : img,
            );
            notifyParent(next);
            return next;
          });
        })
        .catch((err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Upload failed";
          setImages((prev) =>
            prev.map((img) =>
              img.id === entry.id
                ? { ...img, status: "error" as const, errorMessage: message }
                : img,
            ),
          );
        });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const next = prev.filter((img) => img.id !== id);
      notifyParent(next);
      return next;
    });
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {images.map((img) => (
          <div
            key={img.id}
            className="relative aspect-square overflow-hidden rounded-md border border-neutral-200 bg-neutral-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.preview}
              alt=""
              className="h-full w-full object-cover"
            />

            {img.status === "uploading" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            ) : null}

            {img.status === "error" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/70 p-2 text-sm text-white">
                <AlertCircle className="mb-1 h-4 w-4" />
                <span className="text-center">
                  {img.errorMessage ?? "Upload failed"}
                </span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => removeImage(img.id)}
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
              aria-label="Remove image"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {images.length < maxImages ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-square min-h-[44px] flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-600 hover:border-neutral-400"
          >
            <span className="mb-1 text-2xl">+</span>
            <span>Add image</span>
          </button>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />

      <p className="mt-2 text-sm text-neutral-500">
        Up to {maxImages} images. JPEG, PNG, or WebP. Max 5 MB each.
      </p>
    </div>
  );
}
