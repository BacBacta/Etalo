import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIpfsUpload } from "@/hooks/useIpfsUpload";
import { cn } from "@/lib/utils";

const GATEWAY =
  import.meta.env.VITE_PINATA_GATEWAY_URL ??
  "https://gateway.pinata.cloud/ipfs";

interface SingleProps {
  value: string; // ipfs hash, empty when none
  onChange: (hash: string) => void;
  label?: string;
}

/**
 * Single-image upload tile (used for the shop logo).
 * The tile shows 3 states while the user goes through the flow:
 *   - empty    : "Add a logo" placeholder
 *   - pending  : spinner over the local preview
 *   - uploaded : green check over the preview
 *   - error    : red retry button over the preview
 */
export function IpfsLogoUpload({ value, onChange, label }: SingleProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const upload = useIpfsUpload();

  const handlePick = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setLastFile(file);
      upload.mutate(file, {
        onSuccess: (res) => onChange(res.ipfs_hash),
      });
    },
    [onChange, previewUrl, upload],
  );

  const handleRetry = () => {
    if (lastFile) upload.mutate(lastFile, {
      onSuccess: (res) => onChange(res.ipfs_hash),
    });
  };

  const displayUrl =
    previewUrl ?? (value ? `${GATEWAY}/${value}` : null);

  return (
    <div className="flex flex-col gap-2">
      {label ? (
        <span className="text-sm font-medium">{label}</span>
      ) : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed",
          upload.isError ? "border-destructive" : "border-muted",
        )}
        aria-label="Pick a logo"
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <ImagePlus className="h-8 w-8 text-muted-foreground" />
        )}
        {upload.isPending ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin" />
          </span>
        ) : null}
      </button>
      {upload.isError ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRetry}
          className="self-start"
        >
          <RotateCw className="mr-1 h-4 w-4" /> Retry upload
        </Button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

interface MultiProps {
  value: string[];
  onChange: (hashes: string[]) => void;
  max?: number;
}

interface Slot {
  id: number;
  file: File | null;
  hash: string | null;
  previewUrl: string | null;
  status: "pending" | "uploaded" | "error";
}

let slotSeq = 0;

/**
 * Multi-image upload grid (used for product photos, up to 5).
 */
export function IpfsPhotosUpload({ value, onChange, max = 5 }: MultiProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<Slot[]>(() =>
    value.map((hash) => ({
      id: ++slotSeq,
      file: null,
      hash,
      previewUrl: null,
      status: "uploaded" as const,
    })),
  );
  const upload = useIpfsUpload();

  const commit = (next: Slot[]) => {
    setSlots(next);
    onChange(
      next
        .filter((s) => s.status === "uploaded" && s.hash)
        .map((s) => s.hash!),
    );
  };

  const handlePick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = max - slots.length;
    const picked = Array.from(files).slice(0, room);
    const fresh: Slot[] = picked.map((file) => ({
      id: ++slotSeq,
      file,
      hash: null,
      previewUrl: URL.createObjectURL(file),
      status: "pending" as const,
    }));
    const next = [...slots, ...fresh];
    commit(next);

    fresh.forEach((slot) => {
      upload.mutate(slot.file!, {
        onSuccess: (res) => {
          commit(
            next.map((s) =>
              s.id === slot.id
                ? { ...s, hash: res.ipfs_hash, status: "uploaded" as const }
                : s,
            ),
          );
        },
        onError: () => {
          commit(
            next.map((s) =>
              s.id === slot.id ? { ...s, status: "error" as const } : s,
            ),
          );
        },
      });
    });
  };

  const handleRemove = (id: number) => {
    const slot = slots.find((s) => s.id === id);
    if (slot?.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    commit(slots.filter((s) => s.id !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {slots.map((slot) => {
          const url =
            slot.previewUrl ??
            (slot.hash ? `${GATEWAY}/${slot.hash}` : null);
          return (
            <div
              key={slot.id}
              className="relative aspect-square overflow-hidden rounded-md border"
            >
              {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : null}
              {slot.status === "pending" ? (
                <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </span>
              ) : null}
              {slot.status === "error" ? (
                <span className="absolute inset-0 flex items-center justify-center bg-destructive/80 text-destructive-foreground text-xs font-medium">
                  Upload failed
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => handleRemove(slot.id)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        {slots.length < max ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-muted text-muted-foreground"
            aria-label="Add photo"
          >
            <ImagePlus className="h-6 w-6" />
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handlePick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
