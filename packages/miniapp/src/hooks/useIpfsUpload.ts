import { useMutation } from "@tanstack/react-query";

import { apiFetch, ApiError } from "@/lib/api";
import { useMinipay } from "@/hooks/useMinipay";

interface UploadResponse {
  ipfs_hash: string;
  url: string;
  is_dev_stub: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload a single file to /api/v1/uploads/ipfs and return its hash.
 * The caller is responsible for storing the hash in form state and for
 * showing preview/error UI around the mutation's state.
 */
export function useIpfsUpload() {
  const { address } = useMinipay();

  return useMutation<UploadResponse, ApiError, File>({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) {
        throw new ApiError(413, { detail: "File exceeds 5 MB." });
      }
      const form = new FormData();
      form.append("file", file);
      return apiFetch<UploadResponse>("/uploads/ipfs", {
        method: "POST",
        body: form,
        wallet: address!,
        // Let the browser set the multipart boundary — do not override.
        headers: {},
      });
    },
  });
}
