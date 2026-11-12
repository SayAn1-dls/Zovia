import "server-only";

import { z } from "zod";

import { assertActive, assertAdmin, assertRole, assertStaff } from "@/server/auth/guards";
import { newRequestId } from "@/server/auth/context";
import { getCurrentUser, getSession, type CurrentUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { logger, serializeError, type Logger } from "@/server/logger";
import { createSupabasePublicClient } from "@/server/supabase/public";
import type { AppSupabaseClient } from "@/server/supabase/types";

import { AppError, errors, toAppError, validationError } from "./errors";
import { assertSameOrigin, isMutatingMethod } from "./origin";
import {
  clientIp,
  getRateLimiter,
  rateLimitKey,
  resolveRule,
  type RateLimitPreset,
  type RateLimitRule,
} from "./rate-limit";
import { fail } from "./response";

/**
 * Who may call a route:
 *  - "public":   anyone. No cookies are read; `user` is null and `supabase` is the cookieless
 *                anon client.
 *  - "optional": anyone; when a valid session is present `user` is set and `supabase` is
 *                user-scoped (use for public resources with per-user extras).
 *  - "user":     signed in and not suspended (pass `allowSuspended: true` for the appeal flow).
 *  - "owner":    signed in, active, holds the owner role.
 *  - "staff":    signed in, active, moderator or admin.
 *  - "admin":    signed in, active, admin.
 * The database enforces all of this again (RLS, SQL functions); this is the early, clear refusal.
 */
export type AuthLevel = "public" | "optional" | "user" | "owner" | "staff" | "admin";

type Schema = z.ZodType;
type Out<S extends Schema | undefined> = S extends Schema ? z.output<S> : undefined;
type UserFor<A extends AuthLevel> = A extends "public" ? null : A extends "optional" ? CurrentUser | null : CurrentUser;

export type HandlerOptions<
  A extends AuthLevel,
  Q extends Schema | undefined,
  B extends Schema | undefined,
  P extends Schema | undefined,
> = {
  auth: A;
  /**
   * Preset name, custom rule, or false. Default: "mutation" for POST/PUT/PATCH/DELETE, none for
   * GET/HEAD. Keyed by user id when signed in, otherwise by client IP, plus `label`.
   */
  rateLimit?: RateLimitPreset | RateLimitRule | false;
  /** Stable route name for rate-limit keys and logs, e.g. "properties.search". Default: METHOD + path pattern. */
  label?: string;
  /** Zod schema for the query string (values are strings; repeated keys become arrays). */
  query?: Q;
  /** Zod schema for the JSON body. Requires `Content-Type: application/json`. */
  body?: B;
  /** Zod schema for dynamic route params. */
  params?: P;
  /** With auth "user": let suspended accounts through (appeals, reading the suspension reason). */
  allowSuspended?: boolean;
  /** Maximum JSON body size in bytes (default 100 kB). */
  maxBodyBytes?: number;
};

export type HandlerContext<
  A extends AuthLevel = AuthLevel,
  Q extends Schema | undefined = undefined,
  B extends Schema | undefined = undefined,
  P extends Schema | undefined = undefined,
> = {
  request: Request;
  /** Also sent as X-Request-Id and in every error envelope; pass it to services. */
  requestId: string;
  /** Verified caller; null for "public" and for anonymous callers of "optional". */
  user: UserFor<A>;
  /** User-scoped client (RLS as the caller); the cookieless anon client for "public". */
  supabase: AppSupabaseClient;
  query: Out<Q>;
  body: Out<B>;
  params: Out<P>;
  /** Client IP from platform headers (see `clientIp`); null when unknown. Do not log it. */
  ip: string | null;
  /** Logger bound to request_id, route and user_id. */
  log: Logger;
};

/** Second argument Next.js passes to a route handler. */
export type RouteSegment = { params: Promise<Record<string, string | string[] | undefined>> };

export type RouteHandler = (request: Request, segment: RouteSegment) => Promise<Response>;

const DEFAULT_MAX_BODY_BYTES = 100_000;

function routeLabel(request: Request): string {
  const pattern = new URL(request.url).pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:n");
  return `${request.method} ${pattern}`;
}

function queryToObject(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    out[key] = values.length > 1 ? values : (values[0] ?? "");
  }
  return out;
}

async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/(?:[\w.-]+\+)?json\b/i.test(contentType.trim())) {
    throw errors.badRequest("Send the request body as JSON (Content-Type: application/json).");
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw errors.badRequest("The request body is too large.");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw errors.badRequest("The request body is too large.");
  if (text.trim() === "") throw errors.badRequest("The request body is empty.");
  try {
    return JSON.parse(text);
  } catch {
    throw errors.badRequest("The request body is not valid JSON.");
  }
}

function parseWith<S extends Schema>(schema: S, value: unknown, message?: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error, message);
  return result.data;
}

async function authenticate(
  level: AuthLevel,
  allowSuspended: boolean,
): Promise<{ supabase: AppSupabaseClient; user: CurrentUser | null }> {
  if (level === "public") return { supabase: createSupabasePublicClient(), user: null };

  const { supabase } = await getSession();
  const user = await getCurrentUser();
  if (level === "optional") return { supabase, user };
  if (!user) throw errors.unauthenticated();

  switch (level) {
    case "user":
      if (!allowSuspended) assertActive(user);
      break;
    case "owner":
      assertRole(user, "owner");
      break;
    case "staff":
      assertStaff(user);
      break;
    case "admin":
      assertAdmin(user);
      break;
  }
  return { supabase, user };
}

/**
 * Builds a Route Handler. In order: request id -> same-origin check on mutating methods ->
 * authentication and authorisation -> rate limit -> Zod validation of params, query and body
 * (422 with field details) -> `fn`. Anything thrown is mapped to the error envelope; every
 * response carries X-Request-Id; failures are logged as structured JSON without bodies, tokens,
 * e-mail addresses or phone numbers.
 *
 *   export const POST = createHandler(
 *     { auth: "user", rateLimit: "mutation", label: "properties.save", params: z.object({ id: z.uuid() }) },
 *     async ({ user, supabase, params, requestId }) =>
 *       ok(await saveProperty({ supabase, user, requestId }, params.id)),
 *   );
 *
 * `fn` must return a Response: use `ok()` / `created()` from "@/server/http".
 */
export function createHandler<
  A extends AuthLevel,
  Q extends Schema | undefined = undefined,
  B extends Schema | undefined = undefined,
  P extends Schema | undefined = undefined,
>(
  options: HandlerOptions<A, Q, B, P>,
  fn: (context: HandlerContext<A, Q, B, P>) => Response | Promise<Response>,
): RouteHandler {
  return async function handler(request, segment) {
    const requestId = newRequestId();
    const label = options.label ?? routeLabel(request);
    let userId: string | undefined;

    try {
      const config = env();
      assertSameOrigin(request, config.NEXT_PUBLIC_SITE_URL);

      const { supabase, user } = await authenticate(options.auth, options.allowSuspended === true);
      userId = user?.id;

      const ip = clientIp(request.headers);
      const rule =
        options.rateLimit === false
          ? null
          : options.rateLimit !== undefined
            ? resolveRule(options.rateLimit)
            : isMutatingMethod(request.method)
              ? resolveRule("mutation")
              : null;
      if (rule) {
        const result = await getRateLimiter().limit(rateLimitKey(label, { userId, ip }), rule);
        if (!result.allowed) throw errors.rateLimited(result.retryAfterSeconds);
      }

      const params = options.params
        ? parseWith(options.params, (await segment?.params) ?? {}, "That address is not valid.")
        : undefined;
      const query = options.query
        ? parseWith(options.query, queryToObject(new URL(request.url)), "Some filters were not accepted.")
        : undefined;
      const body = options.body
        ? parseWith(options.body, await readJsonBody(request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES))
        : undefined;

      const response = await fn({
        request,
        requestId,
        user: user as UserFor<A>,
        supabase,
        query: query as Out<Q>,
        body: body as Out<B>,
        params: params as Out<P>,
        ip,
        log: logger.child({ request_id: requestId, route: label, user_id: userId }),
      });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (thrown) {
      const error = toAppError(thrown);
      logFailure(error, { requestId, label, method: request.method, userId });
      return fail(error, requestId);
    }
  };
}

/** Expected refusals are "info"/"warn"; only 5xx are errors. Never logs the body or headers. */
export function logFailure(
  error: AppError,
  meta: { requestId: string; label: string; method?: string; userId?: string },
): void {
  const fields = {
    request_id: meta.requestId,
    route: meta.label,
    method: meta.method,
    user_id: meta.userId,
    code: error.code,
    status: error.status,
    ...(error.cause !== undefined && error.code !== "validation_failed"
      ? { cause: serializeError(error.cause) }
      : {}),
  };
  if (error.status >= 500) logger.error("request.failed", fields);
  else if (error.code === "rate_limited" || error.code === "forbidden") logger.warn("request.refused", fields);
  else logger.info("request.rejected", fields);
}
