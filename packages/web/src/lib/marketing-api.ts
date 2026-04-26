/**
 * Marketing API helpers — Sprint J7 Block 7a.
 *
 * Thin wrappers around fetchApi for the credits + image generation
 * endpoints exposed by the backend Block 6:
 *   GET  /sellers/me/credits/balance
 *   GET  /sellers/me/credits/history
 *   POST /marketing/generate-image
 *   POST /marketing/generate-caption
 */
import { fetchApi } from "@/lib/fetch-api";
import type { components } from "@/types/api.gen";

export type GenerateImageRequest =
  components["schemas"]["GenerateImageRequest"];
export type GenerateImageResponse =
  components["schemas"]["GenerateImageResponse"];
export type GenerateCaptionRequest =
  components["schemas"]["GenerateCaptionRequest"];
export type GenerateCaptionResponse =
  components["schemas"]["GenerateCaptionResponse"];

export type CreditsBalanceResponse = {
  balance: number;
  wallet_address: string;
};

export type CreditsHistoryEntry = {
  id: string;
  credits_delta: number;
  source: string;
  tx_hash: string | null;
  image_id: string | null;
  created_at: string;
};

export type CreditsHistoryResponse = {
  entries: CreditsHistoryEntry[];
  page: number;
  page_size: number;
  total: number;
};

/** 402 Payment Required from /generate-image. The available count is
 * not in the response body in V1 (the backend only returns the message);
 * callers should refetch /balance to know the current value. */
export class InsufficientCreditsError extends Error {
  constructor(public readonly detail: string = "Insufficient credits") {
    super(detail);
    this.name = "InsufficientCreditsError";
  }
}

export async function fetchCreditsBalance(
  walletAddress: string,
): Promise<CreditsBalanceResponse> {
  const res = await fetchApi("/sellers/me/credits/balance", {
    headers: { "X-Wallet-Address": walletAddress },
  });
  if (!res.ok) {
    throw new Error(`Credits balance fetch failed: ${res.status}`);
  }
  return (await res.json()) as CreditsBalanceResponse;
}

export async function fetchCreditsHistory(
  walletAddress: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<CreditsHistoryResponse> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  const res = await fetchApi(`/sellers/me/credits/history?${params}`, {
    headers: { "X-Wallet-Address": walletAddress },
  });
  if (!res.ok) {
    throw new Error(`Credits history fetch failed: ${res.status}`);
  }
  return (await res.json()) as CreditsHistoryResponse;
}

export async function generateImage(
  walletAddress: string,
  payload: GenerateImageRequest,
): Promise<GenerateImageResponse> {
  const res = await fetchApi("/marketing/generate-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wallet-Address": walletAddress,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 402) {
    let detail = "Insufficient credits";
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // body wasn't JSON — fall through with default message
    }
    throw new InsufficientCreditsError(detail);
  }
  if (!res.ok) {
    throw new Error(`Generate image failed: ${res.status}`);
  }
  return (await res.json()) as GenerateImageResponse;
}

export async function generateCaption(
  walletAddress: string,
  payload: GenerateCaptionRequest,
): Promise<GenerateCaptionResponse> {
  const res = await fetchApi("/marketing/generate-caption", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wallet-Address": walletAddress,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 503) {
    throw new Error("Caption service temporarily unavailable");
  }
  if (!res.ok) {
    throw new Error(`Generate caption failed: ${res.status}`);
  }
  return (await res.json()) as GenerateCaptionResponse;
}
