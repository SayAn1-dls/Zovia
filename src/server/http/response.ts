import "server-only";

import {
  REQUEST_ID_HEADER,
  type ApiFailure,
  type ApiMeta,
  type ApiSuccess,
} from "@/lib/constants";

import { toAppError } from "./errors";

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // API responses are per-request (auth, rate limits); never let a shared cache keep them.
  "Cache-Control": "no-store",
} as const;

export type ResponseInit = {
  status?: number;
  meta?: ApiMeta;
  headers?: HeadersInit;
  requestId?: string;
};

function buildHeaders(init: HeadersInit | undefined, requestId: string | undefined): Headers {
  const headers = new Headers(BASE_HEADERS);
  if (init) new Headers(init).forEach((value, key) => headers.set(key, value));
  if (requestId) headers.set(REQUEST_ID_HEADER, requestId);
  return headers;
}

/** Success envelope: `{ ok: true, data, meta? }`. */
export function ok<T>(data: T, init: ResponseInit = {}): Response {
  const body: ApiSuccess<T> = init.meta ? { ok: true, data, meta: init.meta } : { ok: true, data };
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: buildHeaders(init.headers, init.requestId),
  });
}

/** 201 with the success envelope. */
export function created<T>(data: T, init: Omit<ResponseInit, "status"> = {}): Response {
  return ok(data, { ...init, status: 201 });
}

/**
 * Failure envelope: `{ ok: false, error: { code, message, details?, request_id } }` with the
 * status that belongs to the code. Accepts any thrown value (mapped through `toAppError`).
 */
export function fail(error: unknown, requestId: string, headers?: HeadersInit): Response {
  const appError = toAppError(error);
  const body: ApiFailure = {
    ok: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      request_id: requestId,
    },
  };
  const out = buildHeaders(headers, requestId);
  if (appError.code === "rate_limited" && appError.retryAfterSeconds !== undefined) {
    out.set("Retry-After", String(Math.max(1, Math.ceil(appError.retryAfterSeconds))));
  }
  return new Response(JSON.stringify(body), { status: appError.status, headers: out });
}
