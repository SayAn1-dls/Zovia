/**
 * Shared, isomorphic constants (safe for client and server). No secrets here.
 */
import type { Database } from "@/lib/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];
export type AccountStatus = Database["public"]["Enums"]["account_status"];

export const USER_ROLES = ["seeker", "owner", "moderator", "admin"] as const satisfies readonly UserRole[];
export const STAFF_ROLES = ["moderator", "admin"] as const satisfies readonly UserRole[];

/** Response/request header carrying the request id (also in every error envelope). */
export const REQUEST_ID_HEADER = "X-Request-Id";

export const API_BASE_PATH = "/api/v1";

/** Page/limit pagination bounds used by `server/http/pagination.ts` and client query builders. */
export const PAGINATION = {
  defaultLimit: 20,
  maxLimit: 50,
  maxPage: 10_000,
} as const;

/** API error codes and their HTTP status (spec section 7). */
export const API_ERROR_STATUS = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  restricted: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

/** Wire format of every `/api/v1` response (spec section 7). */
export type PageMeta = { page: number; limit: number; total: number; has_more: boolean };
export type CursorMeta = { next_cursor: string | null };
export type ApiMeta = PageMeta | CursorMeta;

export type ApiErrorBody = {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  request_id: string;
};

export type ApiSuccess<T, M extends ApiMeta | undefined = ApiMeta | undefined> = {
  ok: true;
  data: T;
  meta?: M;
};
export type ApiFailure = { ok: false; error: ApiErrorBody };
export type ApiEnvelope<T, M extends ApiMeta | undefined = ApiMeta | undefined> =
  | ApiSuccess<T, M>
  | ApiFailure;

/** `error.details` of a `validation_failed` response (Zod "flatten" shape). */
export type ValidationDetails = {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
};

/** What a Server Action built with `createAction` returns (same error shape as the API). */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };
