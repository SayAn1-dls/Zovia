import {
  API_BASE_PATH,
  API_ERROR_STATUS,
  REQUEST_ID_HEADER,
  type ApiErrorCode,
  type ApiMeta,
  type ValidationDetails,
} from "@/lib/constants";

/**
 * Typed fetch for `/api/v1` from client components. Understands the envelope
 * (`{ ok: true, data, meta? }` / `{ ok: false, error }`), returns `data` and throws `ApiError`
 * for everything else, which is exactly what TanStack Query wants:
 *
 *   useQuery({ queryKey: propertyKeys.detail(slug), queryFn: ({ signal }) =>
 *     apiFetch<Property>(`/properties/${slug}`, { signal }) })
 *   useMutation({ mutationFn: (body: SaveInput) => apiFetch<Saved>("/me/saved-properties", { method: "POST", body }) })
 *
 * Same-origin only (cookies are sent by default for same-origin requests).
 */

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | readonly (string | number)[]>;

export type ApiFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Appended to the URL; null/undefined/"" are skipped, arrays repeat the key. */
  query?: QueryParams;
  /** Sent as JSON. */
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  /** One of the API error codes, or "network" / "invalid_response" for transport problems. */
  readonly code: ApiErrorCode | "network" | "invalid_response";
  /** HTTP status; 0 when the request never got a response. */
  readonly status: number;
  readonly details?: unknown;
  /** Quote this to support; it matches the server log line. */
  readonly requestId?: string;

  constructor(init: {
    code: ApiError["code"];
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
    cause?: unknown;
  }) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.details = init.details;
    this.requestId = init.requestId;
  }

  /** Field errors of a `validation_failed` response: `{ field: [messages] }` (empty otherwise). */
  get fieldErrors(): Record<string, string[]> {
    const details = this.details as Partial<ValidationDetails> | undefined;
    return details && typeof details === "object" && details.fieldErrors && typeof details.fieldErrors === "object"
      ? details.fieldErrors
      : {};
  }

  /** True for errors a retry could fix (used by `shouldRetry`). */
  get retryable(): boolean {
    return this.code === "network" || this.code === "unavailable" || this.status >= 502;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** TanStack Query `retry` function: retry transport/5xx problems twice, never 4xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && isApiError(error) && error.retryable;
}

export function buildApiUrl(path: string, query?: QueryParams): string {
  const base = path.startsWith(API_BASE_PATH) ? path : `${API_BASE_PATH}${path.startsWith("/") ? "" : "/"}${path}`;
  if (!query) return base;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

function isErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && value in API_ERROR_STATUS;
}

/** Like `apiFetch`, but also returns `meta` (pagination). */
export async function apiFetchWithMeta<T, M extends ApiMeta = ApiMeta>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<{ data: T; meta: M | undefined }> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, options.query), {
      method,
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: "same-origin",
    });
  } catch (cause) {
    // Let TanStack Query see cancellations as cancellations.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError({
      code: "network",
      message: "We could not reach ZUVIO. Check your connection and try again.",
      status: 0,
      cause,
    });
  }

  const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
  const payload: unknown = await response.json().catch(() => null);
  const envelope = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;

  if (response.ok && envelope?.ok === true) {
    return { data: envelope.data as T, meta: envelope.meta as M | undefined };
  }

  const error = envelope?.ok === false && envelope.error && typeof envelope.error === "object"
    ? (envelope.error as Record<string, unknown>)
    : null;
  if (error && isErrorCode(error.code)) {
    throw new ApiError({
      code: error.code,
      message: typeof error.message === "string" ? error.message : "Something went wrong.",
      status: response.status,
      details: error.details,
      requestId: typeof error.request_id === "string" ? error.request_id : requestId,
    });
  }

  throw new ApiError({
    code: "invalid_response",
    message: "Something went wrong on our side. Please try again.",
    status: response.status,
    requestId,
  });
}

/** Calls `/api/v1{path}` and returns `data`. Throws `ApiError` on any failure. */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return (await apiFetchWithMeta<T>(path, options)).data;
}

/**
 * Query-key factory, one per domain, so invalidation is predictable:
 *   const propertyKeys = createQueryKeys("properties");
 *   propertyKeys.all                -> ["properties"]
 *   propertyKeys.lists()            -> ["properties", "list"]
 *   propertyKeys.list({ city })     -> ["properties", "list", { city }]
 *   propertyKeys.detail(id)         -> ["properties", "detail", id]
 *   propertyKeys.scope("reviews", id) -> ["properties", "reviews", id]
 */
export function createQueryKeys<TScope extends string>(scope: TScope) {
  return {
    all: [scope] as const,
    lists: () => [scope, "list"] as const,
    list: <F>(filters: F) => [scope, "list", filters] as const,
    details: () => [scope, "detail"] as const,
    detail: (id: string) => [scope, "detail", id] as const,
    scope: <P extends readonly unknown[]>(name: string, ...parts: P) => [scope, name, ...parts] as const,
  };
}
