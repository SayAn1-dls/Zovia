import "server-only";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/lib/constants";
import { assertActive, assertAdmin, assertRole, assertStaff } from "@/server/auth/guards";
import { newRequestId, type UserServiceContext } from "@/server/auth/context";
import { getCurrentUser, getSession } from "@/server/auth/session";

import { errors, toAppError, validationError } from "./errors";
import { logFailure } from "./handler";
import {
  clientIp,
  getRateLimiter,
  rateLimitKey,
  resolveRule,
  type RateLimitPreset,
  type RateLimitRule,
} from "./rate-limit";

export type ActionAuth = "user" | "owner" | "staff" | "admin";

export type ActionOptions<S extends z.ZodType | undefined> = {
  /** Server Actions always need a signed-in caller here; public forms use `/api/v1` routes. */
  auth: ActionAuth;
  /** Stable name for rate-limit keys and logs, e.g. "settings.update_profile". */
  label: string;
  /** Zod schema for the single argument. Omit for actions without input. */
  input?: S;
  /** Default "mutation". */
  rateLimit?: RateLimitPreset | RateLimitRule | false;
  /** With auth "user": let suspended accounts through (appeals). */
  allowSuspended?: boolean;
};

/**
 * Builds a Server Action body that never throws to the client: it returns
 * `{ ok: true, data }` or `{ ok: false, error: { code, message, details?, request_id } }`.
 * Order: authenticate and authorise -> rate limit -> validate -> `fn(ctx, input)`.
 * `redirect()` / `notFound()` thrown inside `fn` are passed through to Next.js.
 *
 * Next.js itself rejects cross-origin Server Action requests (Origin vs Host), so there is no
 * separate origin check here.
 *
 *   // features/account/actions.ts
 *   "use server";
 *   const run = createAction(
 *     { auth: "user", label: "account.update_profile", input: profileSchema },
 *     (ctx, input) => updateProfile(ctx, input),
 *   );
 *   export async function updateProfileAction(input: ProfileInput) { return run(input); }
 *
 * (A "use server" file may only export async functions, hence the thin wrapper.)
 */
export function createAction<S extends z.ZodType | undefined, T>(
  options: ActionOptions<S>,
  fn: (context: UserServiceContext, input: S extends z.ZodType ? z.output<S> : undefined) => T | Promise<T>,
): (input: S extends z.ZodType ? z.input<S> : void) => Promise<ActionResult<Awaited<T>>> {
  return async function action(rawInput) {
    const requestId = newRequestId();
    let userId: string | undefined;
    try {
      const { supabase } = await getSession();
      const user = await getCurrentUser();
      if (!user) throw errors.unauthenticated();
      userId = user.id;
      if (options.auth === "user") {
        if (!options.allowSuspended) assertActive(user);
      } else if (options.auth === "owner") assertRole(user, "owner");
      else if (options.auth === "staff") assertStaff(user);
      else assertAdmin(user);

      if (options.rateLimit !== false) {
        const rule = resolveRule(options.rateLimit ?? "mutation");
        const ip = clientIp(await headers());
        const result = await getRateLimiter().limit(rateLimitKey(options.label, { userId, ip }), rule);
        if (!result.allowed) throw errors.rateLimited(result.retryAfterSeconds);
      }

      let input: unknown = undefined;
      if (options.input) {
        const parsed = options.input.safeParse(rawInput);
        if (!parsed.success) throw validationError(parsed.error);
        input = parsed.data;
      }

      const data = await fn({ supabase, user, requestId }, input as never);
      return { ok: true, data: data as Awaited<T> };
    } catch (thrown) {
      unstable_rethrow(thrown); // redirect(), notFound() and other framework signals
      const error = toAppError(thrown);
      logFailure(error, { requestId, label: options.label, method: "ACTION", userId });
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
          request_id: requestId,
        },
      };
    }
  };
}
