/**
 * LogoUploader — single circular image upload for ProfileTab.
 *
 * Distinct from ImageUploader (which is the 8-image grid for product
 * photos) :
 * - One image at a time (a shop has one logo)
 * - Circular preview to match the avatar/logo placement at the top
 *   of the seller dashboard + boutique header
 * - Replaces the existing image when a new one is picked (no
 *   accumulation)
 *
 * Backend storage : `SellerProfile.logo_ipfs_hash` (already present
 * in the schema). Upload uses the same `/uploads/ipfs` endpoint
 * (X-Wallet-Address auth) ImageUploader uses, so the seller-auth
 * surface and the size/type validation are shared.
 */
"use client";

import {
  CircleNotch,
  ImageSquare,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { uploadImage } from "@/lib/seller-api";

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

interface Props {
  /** IPFS hash of the currently saved logo (null when no logo). */
  value: string | null;
  /** Fires with the new IPFS hash on successful upload, or null when
   *  the seller removes the logo. Parent owns the persistence step. */
  onChange: (hash: string | null) => void;
  walletAddress: string;
  disabled?: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; localPreview: string }
  | { kind: "error"; message: string };

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export function LogoUploader({
  value,
  onChange,
  walletAddress,
  disabled,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Capture the latest onChange so the upload-success callback below
  // doesn't capture a stale handler closure if the parent re-renders
  // mid-upload (same pattern as ImageUploader).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const isUploading = status.kind === "uploading";
  const previewUrl = isUploading
    ? status.localPreview
    : value
    ? `${PINATA_GATEWAY}${value}`
    : null;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const localPreview = await readFileAsDataURL(file);
      setStatus({ kind: "uploading", localPreview });
      const response = await uploadImage(walletAddress, file);
      setStatus({ kind: "idle" });
      onChangeRef.current(response.ipfs_hash);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setStatus({ kind: "error", message });
    } finally {
      // Reset the input so picking the same file again triggers
      // onChange (browsers de-dupe identical successive selections).
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = () => {
    setStatus({ kind: "idle" });
    onChangeRef.current(null);
  };

  const openPicker = () => {
    if (disabled || isUploading) return;
    fileInputRef.current?.click();
  };

  return (
    <div>
      <span className="mb-1 block text-base font-medium text-celo-dark dark:text-celo-light">
        Shop logo
      </span>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || isUploading}
          aria-label={value ? "Change shop logo" : "Upload shop logo"}
          data-testid="logo-upload-trigger"
          className="relative flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 hover:border-celo-forest hover:text-celo-forest disabled:cursor-not-allowed disabled:opacity-60 dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light/40 dark:hover:border-celo-forest-bright dark:hover:text-celo-forest-bright"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-cover"
              data-testid="logo-preview"
            />
          ) : (
            <ImageSquare className="h-8 w-8" aria-hidden />
          )}
          {isUploading ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
              <CircleNotch
                className="h-6 w-6 animate-spin text-white"
                data-testid="logo-uploading-spinner"
                aria-label="Uploading"
              />
            </div>
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            JPEG, PNG, or WebP. Max 5 MB. Square images render best.
          </p>
          {value && !isUploading ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              data-testid="logo-remove"
              className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm text-red-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-celo-red-bright"
            >
              <Trash className="h-4 w-4" aria-hidden />
              Remove logo
            </button>
          ) : null}
          {status.kind === "error" ? (
            <p
              role="alert"
              data-testid="logo-error"
              className="mt-2 inline-flex items-start gap-1 text-sm text-red-600 dark:text-celo-red-bright"
            >
              <WarningCircle
                className="mt-0.5 h-4 w-4 flex-shrink-0"
                aria-hidden
              />
              {status.message}
            </p>
          ) : null}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => void handleFiles(e.target.files)}
        className="hidden"
        data-testid="logo-file-input"
      />
    </div>
  );
}
