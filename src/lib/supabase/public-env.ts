/**
 * Public environment for client code. Every value here is inlined into the browser bundle by
 * Next.js, which only happens for literal `process.env.NEXT_PUBLIC_*` references, so each one is
 * spelled out. Nothing secret may ever be added to this file.
 *
 * Server code should use `@/server/env` instead (validated, includes server-only variables).
 */
function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return trimmed;
}

export const publicEnv = {
  /** Throws a clear error when unset (read lazily so importing this module never throws). */
  get supabaseUrl(): string {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey(): string {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  get siteUrl(): string {
    return required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL).replace(/\/+$/, "");
  },
  get googleAuthEnabled(): boolean {
    return process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
  },
  get phoneAuthEnabled(): boolean {
    return process.env.NEXT_PUBLIC_ENABLE_PHONE_AUTH === "true";
  },
  get gaMeasurementId(): string | undefined {
    return optional(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  },
  get whatsappNumber(): string | undefined {
    return optional(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);
  },
  get supportEmail(): string | undefined {
    return optional(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
  },
} as const;
