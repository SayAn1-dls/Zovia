import "server-only";

import { z } from "zod";

import { API_ERROR_STATUS, type ApiErrorCode, type ValidationDetails } from "@/lib/constants";
import { EnvError } from "@/server/env";

/**
 * The one error type that crosses layers. Repositories and services throw AppError (or let a
 * Supabase error through `throwIfError`), handlers turn it into the API envelope.
 *
 * `message` is always safe to show to an end user. Anything diagnostic goes in `cause`, which
 * is logged (redacted) and never sent to the client.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** Seconds the client should wait; set for `rate_limited`. */
  readonly retryAfterSeconds?: number;

  constructor(
    code: ApiErrorCode,
    message?: string,
    options: { details?: unknown; cause?: unknown; retryAfterSeconds?: number } = {},
  ) {
    super(message ?? DEFAULT_MESSAGES[code], options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = API_ERROR_STATUS[code];
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  bad_request: "That request could not be understood.",
  unauthenticated: "Please sign in to continue.",
  forbidden: "You do not have permission to do that.",
  restricted: "Your account is restricted from doing that.",
  not_found: "We could not find what you were looking for.",
  conflict: "That conflicts with something that already exists.",
  validation_failed: "Some details were not accepted. Please check and try again.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  unavailable: "The service is temporarily unavailable. Please try again shortly.",
  internal: "Something went wrong on our side. Please try again.",
};

type Options = { details?: unknown; cause?: unknown };

/** Throwable factories: `throw errors.notFound("Listing not found.")`. */
export const errors = {
  badRequest: (message?: string, options?: Options) => new AppError("bad_request", message, options),
  unauthenticated: (message?: string, options?: Options) => new AppError("unauthenticated", message, options),
  forbidden: (message?: string, options?: Options) => new AppError("forbidden", message, options),
  restricted: (message?: string, options?: Options) => new AppError("restricted", message, options),
  notFound: (message?: string, options?: Options) => new AppError("not_found", message, options),
  conflict: (message?: string, options?: Options) => new AppError("conflict", message, options),
  validation: (details: ValidationDetails, message?: string) =>
    new AppError("validation_failed", message, { details }),
  rateLimited: (retryAfterSeconds?: number, message?: string) =>
    new AppError("rate_limited", message, { retryAfterSeconds }),
  unavailable: (message?: string, options?: Options) => new AppError("unavailable", message, options),
  internal: (message?: string, options?: Options) => new AppError("internal", message, options),
};

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Zod error -> the `details` object of a `validation_failed` response. */
export function validationDetails(error: z.ZodError): ValidationDetails {
  const details: ValidationDetails = { formErrors: [], fieldErrors: {} };
  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      details.formErrors.push(issue.message);
    } else {
      const key = issue.path.map(String).join(".");
      (details.fieldErrors[key] ??= []).push(issue.message);
    }
  }
  return details;
}

export function validationError(error: z.ZodError, message?: string): AppError {
  return new AppError("validation_failed", message, { details: validationDetails(error), cause: error });
}

/** SQLSTATEs raised by our own SQL functions (spec section 6): the message is user-safe. */
const ZV_CODES: Record<string, ApiErrorCode> = {
  ZV400: "bad_request",
  ZV401: "unauthenticated",
  ZV403: "forbidden",
  ZV404: "not_found",
  ZV409: "conflict",
  ZV422: "validation_failed",
  ZV423: "restricted",
  ZV429: "rate_limited",
};

/** Standard Postgres / PostgREST / Storage codes. Their messages are NOT shown to users. */
const PG_CODES: Record<string, ApiErrorCode> = {
  // integrity
  "23505": "conflict", // unique_violation
  "23P01": "conflict", // exclusion_violation
  "23503": "conflict", // foreign_key_violation (referenced row missing or still referenced)
  "23502": "validation_failed", // not_null_violation
  "23514": "validation_failed", // check_violation
  "22001": "validation_failed", // string_data_right_truncation
  "22003": "validation_failed", // numeric_value_out_of_range
  "22007": "validation_failed", // invalid_datetime_format
  "22008": "validation_failed", // datetime_field_overflow
  "22P02": "bad_request", // invalid_text_representation (e.g. malformed uuid)
  "22023": "bad_request", // invalid_parameter_value
  // permissions
  "42501": "forbidden", // insufficient_privilege: missing grant or RLS violation on write
  PGRST301: "unauthenticated", // JWT expired / invalid
  PGRST302: "unauthenticated", // anonymous access disabled
  PGRST303: "unauthenticated", // JWT claims invalid / expired
  // not found
  PGRST116: "not_found", // .single() matched no (or several) rows
  // concurrency / availability
  "40001": "conflict", // serialization_failure
  "40P01": "conflict", // deadlock_detected
  "55P03": "conflict", // lock_not_available
  "57014": "unavailable", // query_canceled (statement timeout)
  "53300": "unavailable", // too_many_connections
  "08006": "unavailable", // connection_failure
  PGRST000: "unavailable", // PostgREST could not connect to the database
  PGRST001: "unavailable",
  PGRST002: "unavailable", // schema cache not loaded yet
  PGRST003: "unavailable", // pool timeout
};

type ErrorLike = { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown; name?: unknown };

function asErrorLike(value: unknown): ErrorLike | null {
  return value !== null && typeof value === "object" ? (value as ErrorLike) : null;
}

/**
 * Maps an error returned by supabase-js (PostgREST, RPC, Storage, Auth) or thrown by fetch to
 * an AppError. Unknown errors become `internal` with a generic message; the original is kept as
 * `cause` for the log.
 */
export function fromSupabaseError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const like = asErrorLike(error);
  const code = typeof like?.code === "string" ? like.code : undefined;
  const message = typeof like?.message === "string" ? like.message : undefined;

  if (code) {
    const zv = ZV_CODES[code];
    if (zv) return new AppError(zv, message?.trim() || undefined, { cause: error });
    const pg = PG_CODES[code];
    if (pg) return new AppError(pg, undefined, { cause: error });
  }

  // Storage and Auth errors carry an HTTP status instead of an SQLSTATE.
  const rawStatus = like?.status ?? like?.statusCode;
  const status = typeof rawStatus === "string" ? Number.parseInt(rawStatus, 10) : rawStatus;
  if (typeof status === "number" && Number.isFinite(status)) {
    if (status === 401) return new AppError("unauthenticated", undefined, { cause: error });
    if (status === 403) return new AppError("forbidden", undefined, { cause: error });
    if (status === 404) return new AppError("not_found", undefined, { cause: error });
    if (status === 409) return new AppError("conflict", undefined, { cause: error });
    if (status === 413 || status === 415 || status === 422)
      return new AppError("validation_failed", undefined, { cause: error });
    if (status === 429) return new AppError("rate_limited", undefined, { cause: error });
    if (status >= 502 && status <= 504) return new AppError("unavailable", undefined, { cause: error });
  }

  // supabase-js reports a failed fetch as a message with no code; AbortSignal.timeout aborts.
  const name = typeof like?.name === "string" ? like.name : "";
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    (message !== undefined && /fetch failed|failed to fetch|network|ECONNREFUSED|ENOTFOUND|timed out/i.test(message))
  ) {
    return new AppError("unavailable", undefined, { cause: error });
  }

  return new AppError("internal", undefined, { cause: error });
}

/** Any thrown value -> AppError. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof z.ZodError) return validationError(error);
  if (error instanceof EnvError) return new AppError("unavailable", undefined, { cause: error });
  return fromSupabaseError(error);
}

/**
 * For repositories: `const data = unwrap(await supabase.from("x").select(...))`.
 * Throws the mapped AppError when the result carries an error, otherwise returns `data`.
 */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw fromSupabaseError(result.error);
  return result.data;
}

/** Like `unwrap`, but a null row (from `.maybeSingle()`) becomes `not_found`. */
export function unwrapOrNotFound<T>(result: { data: T | null; error: unknown }, message?: string): T {
  const data = unwrap(result);
  if (data === null) throw errors.notFound(message);
  return data;
}
