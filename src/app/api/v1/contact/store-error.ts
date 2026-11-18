import { fromSupabaseError, type AppError } from "@/server/http";

/**
 * `submit_contact_message()` is the authority on this form: it validates (ZV422) and rate-limits
 * (ZV429: per address and global). Those two answers must reach the visitor and stop the mail.
 * Anything else (database unreachable, grant problems) returns null and the route falls back to
 * e-mail only.
 */
export function contactRefusal(cause: unknown): AppError | null {
  const error = fromSupabaseError(cause);
  return error.code === "rate_limited" || error.code === "validation_failed" ? error : null;
}
