import "server-only";

import { isAuthError, type EmailOtpType } from "@supabase/supabase-js";

import { AppError, errors } from "@/server/http/errors";
import type { AppSupabaseClient } from "@/server/supabase/types";

/**
 * The only place the auth module talks to Supabase Auth. Every call goes through the caller's
 * cookie-bound client (`@supabase/ssr`, PKCE flow), so a successful sign-in writes the session
 * cookies on the response and nothing here sees a service-role key.
 *
 * Supabase Auth errors are translated into AppError with messages fit for the person at the
 * keyboard. Messages never say whether an e-mail address has an account.
 */

function toAuthAppError(error: unknown): AppError {
  if (!isAuthError(error)) return errors.internal(undefined, { cause: error });
  switch (error.code) {
    case "invalid_credentials":
      return errors.unauthenticated("That e-mail and password do not match. Check them and try again.");
    case "email_not_confirmed":
      return errors.forbidden("Verify your e-mail address first. We can send the link again.", {
        details: { reason: "email_not_confirmed" },
      });
    case "weak_password":
      return errors.validation(
        { formErrors: [], fieldErrors: { password: ["Choose a stronger password: at least 8 characters with letters and numbers."] } },
        "Choose a stronger password.",
      );
    case "same_password":
      return errors.validation(
        { formErrors: [], fieldErrors: { password: ["Choose a password you have not used here before."] } },
        "Choose a new password.",
      );
    case "email_address_invalid":
      return errors.validation(
        { formErrors: [], fieldErrors: { email: ["That e-mail address cannot receive mail."] } },
        "Check your e-mail address.",
      );
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return errors.rateLimited(undefined, "Too many attempts. Please wait a minute and try again.");
    case "signup_disabled":
      return errors.unavailable("New sign-ups are paused right now. Please try again later.");
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return errors.badRequest("That link is invalid or has expired.", { details: { reason: "link_invalid" } });
    default:
      if (error.status === 429) return errors.rateLimited();
      if (error.status && error.status >= 400 && error.status < 500) {
        return errors.badRequest(undefined, { cause: error });
      }
      return errors.unavailable("We could not reach the sign-in service. Please try again.", { cause: error });
  }
}

export async function signUpWithPassword(
  supabase: AppSupabaseClient,
  input: { email: string; password: string; full_name: string; emailRedirectTo: string },
): Promise<{ userId: string | null; signedIn: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    // Read by `handle_new_auth_user()` only as a sanitised display name.
    options: { emailRedirectTo: input.emailRedirectTo, data: { full_name: input.full_name } },
  });
  if (error) throw toAuthAppError(error);
  // With e-mail confirmation switched off in Supabase Auth, sign-up returns a session at once
  // (and the cookies are already written); with it on, there is no session until the link.
  return { userId: data.user?.id ?? null, signedIn: data.session !== null };
}

export async function signInWithPassword(
  supabase: AppSupabaseClient,
  input: { email: string; password: string },
): Promise<{ userId: string }> {
  const { data, error } = await supabase.auth.signInWithPassword(input);
  if (error) throw toAuthAppError(error);
  return { userId: data.user.id };
}

export async function resendSignUpEmail(
  supabase: AppSupabaseClient,
  input: { email: string; emailRedirectTo: string },
): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: input.email,
    options: { emailRedirectTo: input.emailRedirectTo },
  });
  if (error) throw toAuthAppError(error);
}

export async function sendPasswordResetEmail(
  supabase: AppSupabaseClient,
  input: { email: string; redirectTo: string },
): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(input.email, { redirectTo: input.redirectTo });
  if (error) throw toAuthAppError(error);
}

export async function updatePassword(supabase: AppSupabaseClient, password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw toAuthAppError(error);
}

export async function exchangeCodeForSession(supabase: AppSupabaseClient, code: string): Promise<void> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw toAuthAppError(error);
}

export async function verifyEmailToken(
  supabase: AppSupabaseClient,
  input: { token_hash: string; type: EmailOtpType },
): Promise<void> {
  const { error } = await supabase.auth.verifyOtp(input);
  if (error) throw toAuthAppError(error);
}

/** Verified user id of the session the client now holds (signature-checked, not just decoded). */
export async function getVerifiedUserId(supabase: AppSupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  const sub = error ? undefined : data?.claims?.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}

export async function signOut(supabase: AppSupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw toAuthAppError(error);
}
