/**
 * useAddresses — Sprint J11.7 Block 6 (ADR-044).
 *
 * TanStack Query hooks around the buyer address book. Exposes :
 *   - useAddresses(wallet) — list query
 *   - useCreateAddress(wallet) — POST mutation
 *   - useUpdateAddress(wallet) — PATCH mutation
 *   - useDeleteAddress(wallet) — DELETE mutation
 *   - useSetDefaultAddress(wallet) — POST set-default mutation
 *
 * Each mutation invalidates the list query so consumers see updated
 * order + default flags without manual refetch.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type DeliveryAddress,
  type DeliveryAddressCreate,
  type DeliveryAddressList,
  type DeliveryAddressUpdate,
  createAddress,
  deleteAddress,
  fetchAddresses,
  setDefaultAddress,
  updateAddress,
} from "@/lib/addresses/api";

export const ADDRESSES_QUERY_KEY = "buyer-addresses";

export interface UseAddressesArgs {
  wallet: string | undefined;
  enabled?: boolean;
}

export function useAddresses({ wallet, enabled = true }: UseAddressesArgs) {
  return useQuery<DeliveryAddressList, Error>({
    queryKey: [ADDRESSES_QUERY_KEY, wallet?.toLowerCase()],
    queryFn: () => {
      if (!wallet) throw new Error("wallet required");
      return fetchAddresses(wallet);
    },
    enabled: enabled && Boolean(wallet),
    staleTime: 30_000,
    retry: 1,
  });
}

interface MutationArgs {
  wallet: string | undefined;
}

function useInvalidateAddresses(wallet: string | undefined) {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      queryKey: [ADDRESSES_QUERY_KEY, wallet?.toLowerCase()],
    });
}

export function useCreateAddress({ wallet }: MutationArgs) {
  const invalidate = useInvalidateAddresses(wallet);
  return useMutation<DeliveryAddress, Error, DeliveryAddressCreate>({
    mutationFn: (payload) => {
      if (!wallet) throw new Error("wallet required");
      return createAddress(wallet, payload);
    },
    onSuccess: () => {
      void invalidate();
    },
  });
}

export interface UpdateAddressVars {
  id: string;
  payload: DeliveryAddressUpdate;
}

export function useUpdateAddress({ wallet }: MutationArgs) {
  const invalidate = useInvalidateAddresses(wallet);
  return useMutation<DeliveryAddress, Error, UpdateAddressVars>({
    mutationFn: ({ id, payload }) => {
      if (!wallet) throw new Error("wallet required");
      return updateAddress(wallet, id, payload);
    },
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useDeleteAddress({ wallet }: MutationArgs) {
  const invalidate = useInvalidateAddresses(wallet);
  return useMutation<void, Error, string>({
    mutationFn: (id) => {
      if (!wallet) throw new Error("wallet required");
      return deleteAddress(wallet, id);
    },
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useSetDefaultAddress({ wallet }: MutationArgs) {
  const invalidate = useInvalidateAddresses(wallet);
  return useMutation<DeliveryAddress, Error, string>({
    mutationFn: (id) => {
      if (!wallet) throw new Error("wallet required");
      return setDefaultAddress(wallet, id);
    },
    onSuccess: () => {
      void invalidate();
    },
  });
}
