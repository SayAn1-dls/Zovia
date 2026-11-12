import { z } from "zod";

/**
 * Auth contracts (isomorphic). The same schemas validate the forms in the browser and the
 * `/api/v1/auth/*` bodies on the server. Password rules mirror supabase/config.toml
 * (`minimum_password_length = 8`, `password_requirements = "letters_digits"`), so the form
 * refuses what the Auth server would refuse, with a clearer message.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your e-mail address.")
  .max(254, "That e-mail address is too long.")
  .pipe(z.email("Enter a valid e-mail address, like name@example.com."));

export const newPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), "Use both letters and numbers.");

/** Same-origin relative path; the server re-validates it with `safeNextPath`. */
const nextPathSchema = z.string().max(2048).optional();

export const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name.").max(60, "Keep your name under 60 characters."),
  email: emailSchema,
  password: newPasswordSchema,
  next: nextPathSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(72, "That password is too long."),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const emailOnlySchema = z.object({ email: emailSchema, next: nextPathSchema });
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;

export const resetPasswordSchema = z
  .object({ password: newPasswordSchema, confirm_password: z.string() })
  .refine((value) => value.password === value.confirm_password, {
    path: ["confirm_password"],
    message: "The passwords do not match.",
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** What `/api/v1/auth/sign-up` returns. */
export type SignUpResult = { status: "signed_in"; redirect_to: string } | { status: "verification_sent" };

/** What `/api/v1/auth/sign-in` returns: where the browser should go next. */
export type SignInResult = { redirect_to: string };

/** `/auth/confirm` and `/auth/callback` send people here with `?error=` when a link fails. */
export const AUTH_LINK_ERRORS = {
  link_invalid: "That link is invalid or has expired. Request a new one below.",
  oauth_failed: "Signing in with that provider did not work. Try again or use e-mail.",
} as const;
export type AuthLinkError = keyof typeof AUTH_LINK_ERRORS;
