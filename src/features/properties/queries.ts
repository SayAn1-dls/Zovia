"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/components/session/session-context";
import { apiFetch, createQueryKeys, shouldRetry } from "@/lib/api/client";

import type { InquiryInput, OwnerContact } from "./schemas";

/** Client hooks for the per-user parts of public property pages (TanStack Query -> /api/v1). */

export const propertyKeys = createQueryKeys("properties");
const savedIdsKey = propertyKeys.scope("saved-ids");

/** Ids of the caller's saved listings; empty (and no request) when signed out. */
export function useSavedIds() {
  const session = useSession();
  return useQuery({
    queryKey: savedIdsKey,
    queryFn: ({ signal }) => apiFetch<string[]>("/me/saved-properties/ids", { signal }),
    enabled: session.isSignedIn,
    staleTime: 60_000,
    retry: shouldRetry,
    select: (ids) => new Set(ids),
  });
}

/** Save / unsave with an optimistic update of the saved-ids cache. */
export function useToggleSaved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, save }: { propertyId: string; save: boolean }) =>
      save
        ? apiFetch<{ property_id: string }>("/me/saved-properties", { method: "POST", body: { property_id: propertyId } })
        : apiFetch<{ property_id: string }>(`/me/saved-properties/${encodeURIComponent(propertyId)}`, {
            method: "DELETE",
          }),
    onMutate: async ({ propertyId, save }) => {
      await queryClient.cancelQueries({ queryKey: savedIdsKey });
      const previous = queryClient.getQueryData<string[]>(savedIdsKey);
      queryClient.setQueryData<string[]>(savedIdsKey, (ids = []) =>
        save ? [propertyId, ...ids.filter((id) => id !== propertyId)] : ids.filter((id) => id !== propertyId),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(savedIdsKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: savedIdsKey }),
  });
}

export function useRevealContact(propertyId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<OwnerContact>(`/properties/${encodeURIComponent(propertyId)}/contact`, { method: "POST" }),
  });
}

export function useSendInquiry(propertyId: string) {
  return useMutation({
    mutationFn: (input: InquiryInput) =>
      apiFetch<{ id: string }>(`/properties/${encodeURIComponent(propertyId)}/inquiries`, {
        method: "POST",
        body: input,
      }),
  });
}
