import "server-only";

import { safeNextPath } from "@/lib/api/safe-next-path";
import { routes } from "@/lib/navigation";
import type { ServiceContext } from "@/server/auth/context";
import { fetchAccessRow } from "@/server/auth/access-repository";
import { env } from "@/server/env";
import { errors } from "@/server/http/errors";

import * as repo from "./repository";
import type { EmailOnlyInput, SignInInput, SignInResult, SignUpInput, SignUpResult } from "./schemas";

/**
 * Auth use cases. Identity always comes from Supabase Auth through the caller's cookie session;
 * where a signed-in user goes next is decided from their `users` row (RLS: own row only), never
 * from anything the client sent except a validated same-origin `next` path.
 */

const EMAIL_OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

export function isEmailOtpType(value: unknown): value is EmailOtpType {
  return typeof value === "string" && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

/** Absolute URL of `/auth/confirm`, carrying a validated `next`. Links in e-mails land here. */
function confirmUrl(next: string | undefined): string {
  const url = new URL("/auth/confirm", env().NEXT_PUBLIC_SITE_URL);
  const safe = safeNextPath(next, "");
  if (safe) url.searchParams.set("next", safe);
  return url.toString();
}

/**
 * Whether e-mail verification is required is decided by Supabase Auth's own setting
 * (`[auth.email] enable_confirmations` locally, Authentication > Providers > Email in the
 * dashboard). This handles both: signed in at once, or "check your inbox".
 */
export async function signUp(ctx: ServiceContext, input: SignUpInput): Promise<SignUpResult> {
  const result = await repo.signUpWithPassword(ctx.supabase, {
    email: input.email,
    password: input.password,
    full_name: input.full_name,
    emailRedirectTo: confirmUrl(input.next),
  });
  if (result.signedIn && result.userId) {
    return { status: "signed_in", redirect_to: await postSignInPath(ctx, result.userId, input.next) };
  }
  return { status: "verification_sent" };
}

/**
 * Where a person lands after signing in: suspended -> the suspension page; otherwise `next` when
 * given, else search (onboarding is optional).
 */
export async function postSignInPath(ctx: ServiceContext, userId: string, next: string | undefined): Promise<string> {
  const row = await fetchAccessRow(ctx.supabase, userId);
  const safe = safeNextPath(next, "");
  if (!row) return routes.home;
  if (row.status === "suspended") return routes.accountSuspended;
  return safe || routes.search;
}

export async function signIn(ctx: ServiceContext, input: SignInInput & { next?: string }): Promise<SignInResult> {
  const { userId } = await repo.signInWithPassword(ctx.supabase, { email: input.email, password: input.password });
  return { redirect_to: await postSignInPath(ctx, userId, input.next) };
}

export async function resendVerification(ctx: ServiceContext, input: EmailOnlyInput): Promise<void> {
  await repo.resendSignUpEmail(ctx.supabase, { email: input.email, emailRedirectTo: confirmUrl(input.next) });
}

export async function requestPasswordReset(ctx: ServiceContext, input: EmailOnlyInput): Promise<void> {
  await repo.sendPasswordResetEmail(ctx.supabase, {
    email: input.email,
    redirectTo: confirmUrl(routes.resetPassword),
  });
}

/** Needs the session created by the recovery link (or any signed-in session). */
export async function setNewPassword(ctx: ServiceContext, password: string): Promise<void> {
  if (!ctx.user) throw errors.unauthenticated("Your reset link has expired. Request a new one.");
  await repo.updatePassword(ctx.supabase, password);
}

/**
 * Completes an e-mail link or OAuth redirect and returns where to send the browser. Accepts
 * both shapes Supabase produces: `?code=` (PKCE, default e-mail templates and OAuth) and
 * `?token_hash=&type=` (the templates in supabase/templates, which work in any browser).
 */
export async function completeAuthRedirect(
  ctx: ServiceContext,
  params: { code?: string | null; token_hash?: string | null; type?: string | null; next?: string | null },
): Promise<string> {
  if (params.token_hash && isEmailOtpType(params.type)) {
    await repo.verifyEmailToken(ctx.supabase, { token_hash: params.token_hash, type: params.type });
  } else if (params.code) {
    await repo.exchangeCodeForSession(ctx.supabase, params.code);
  } else {
    throw errors.badRequest("That link is incomplete.", { details: { reason: "link_invalid" } });
  }

  const userId = await repo.getVerifiedUserId(ctx.supabase);
  if (!userId) throw errors.badRequest("That link is invalid or has expired.", { details: { reason: "link_invalid" } });

  // A recovery link must end on the reset form whatever `next` says.
  if (params.type === "recovery") return routes.resetPassword;
  return postSignInPath(ctx, userId, params.next ?? undefined);
}

export async function signOut(ctx: ServiceContext): Promise<void> {
  await repo.signOut(ctx.supabase);
}
