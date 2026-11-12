import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";

import { applyApiFieldErrors } from "@/components/form/form-field";
import { isApiError } from "@/lib/api/client";

export type Failure = { title: string; detail: string; code?: string; reference?: string; reason?: string };

/** Turns anything `apiFetch` threw into a message for the form, copying field errors across. */
export function toFailure<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly FieldPath<T>[],
): Failure {
  if (!isApiError(error)) {
    return { title: "Something went wrong", detail: "Please try again in a moment." };
  }
  if (error.code === "network") {
    return { title: "You appear to be offline", detail: "Check your connection and try again." };
  }
  if (error.code === "validation_failed") applyApiFieldErrors(setError, error.details, fields);
  const reason =
    error.details && typeof error.details === "object" && "reason" in error.details
      ? String((error.details as { reason: unknown }).reason)
      : undefined;
  return {
    title: error.code === "validation_failed" ? "Please check the form" : "That did not work",
    detail: error.message,
    code: error.code,
    reference: error.status >= 500 ? error.requestId : undefined,
    reason,
  };
}
