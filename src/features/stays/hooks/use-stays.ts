import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, createQueryKeys, isApiError, shouldRetry } from "@/lib/api/client";

import type {
  CancelStayResult,
  CreateStayBookingInput,
  CreateStayBookingResult,
  StayAvailability,
  StayBooking,
  StayQuote,
  StayRequest,
} from "../schemas";
import { serializeRooms } from "./stay-url-state";

/** TanStack Query hooks for the stay endpoints (`/api/v1/stays/**`). Prices always come from the server. */

export const stayKeys = createQueryKeys("stays");

export function useStayAvailability(input: { listing: string; checkin: string; checkout: string }, enabled = true) {
  return useQuery({
    queryKey: stayKeys.scope("availability", input.listing, input.checkin, input.checkout),
    queryFn: ({ signal }) => apiFetch<StayAvailability>("/stays/availability", { query: input, signal }),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });
}

/** Quote for a selection; disabled until at least one bed is chosen. Keeps the last quote while a new one loads. */
export function useStayQuote(request: StayRequest | null) {
  return useQuery({
    queryKey: stayKeys.scope(
      "quote",
      request?.listing ?? "",
      request?.checkin ?? "",
      request?.checkout ?? "",
      request ? (serializeRooms(request.rooms) ?? "") : "",
    ),
    queryFn: ({ signal }) => apiFetch<StayQuote>("/stays/quote", { method: "POST", body: request, signal }),
    enabled: request !== null && request.rooms.length > 0,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });
}

export function useStayBookings() {
  return useQuery({
    queryKey: stayKeys.lists(),
    queryFn: ({ signal }) => apiFetch<StayBooking[]>("/stays/bookings", { signal }),
    retry: shouldRetry,
  });
}

/** One stay booking. A 404 is an answer (it may be an old-style booking), not an error to retry. */
export function useStayBooking(id: string) {
  return useQuery({
    queryKey: stayKeys.detail(id),
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<StayBooking>(`/stays/bookings/${encodeURIComponent(id)}`, { signal });
      } catch (error) {
        if (isApiError(error) && (error.code === "not_found" || error.status === 404)) return null;
        throw error;
      }
    },
    retry: shouldRetry,
  });
}

export function useCreateStayBooking() {
  return useMutation({
    mutationFn: (body: CreateStayBookingInput) => apiFetch<CreateStayBookingResult>("/stays/bookings", { method: "POST", body }),
  });
}

export type RazorpayProof = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

export function verifyStayPayment(id: string, proof: RazorpayProof) {
  return apiFetch<StayBooking>(`/stays/bookings/${encodeURIComponent(id)}/verify-payment`, { method: "POST", body: proof });
}

export function useCancelStay(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      apiFetch<CancelStayResult>(`/stays/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST", body: reason ? { reason } : {} }),
    onSuccess: (result) => {
      queryClient.setQueryData(stayKeys.detail(id), result.booking);
      void queryClient.invalidateQueries({ queryKey: stayKeys.lists() });
    },
  });
}

/** Payment instruction for an unpaid booking of the caller (re-uses the open order). */
export function fetchStayPayment(id: string) {
  return apiFetch<CreateStayBookingResult>(`/stays/bookings/${encodeURIComponent(id)}/pay`, { method: "POST", body: {} });
}
