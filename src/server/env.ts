import "server-only";

import { z } from "zod";

/**
 * Zod-validated access to every environment variable the application reads (spec section 11).
 * Evaluated lazily on first use, so importing this module never throws and `next build` works
 * without runtime secrets. Only the first three public variables are required.
 *
 * Empty strings ("FOO=") count as unset.
 */

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.url().optional(),
);
const flag = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() === "true" : false),
  z.boolean(),
);
const httpUrl = z
  .url({ protocol: /^https?$/, error: "must be an http(s) URL" })
  .transform((value) => value.replace(/\/+$/, ""));

const envSchema = z.object({
  // Public (also inlined into the browser bundle)
  NEXT_PUBLIC_SITE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
  NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: flag,
  NEXT_PUBLIC_ENABLE_PHONE_AUTH: flag,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: optionalString,
  NEXT_PUBLIC_WHATSAPP_NUMBER: optionalString,
  NEXT_PUBLIC_SUPPORT_EMAIL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.email().optional(),
  ),
  // Server only
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  AI_PROVIDER: optionalString,
  AI_PROVIDER_API_KEY: optionalString,
  AI_MODEL: optionalString,
  GOOGLE_MAPS_API_KEY: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  GOOGLE_SITE_VERIFICATION: optionalString,
  // Razorpay (bookings, spec section 14.2). Payments are enabled only when all three are set.
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,
  // Local demo payments (no money moves). Ignored in production builds.
  PAYMENTS_DEMO_MODE: flag,
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  /** Names of the invalid or missing variables. Never contains values. */
  readonly variables: string[];
  constructor(variables: string[], summary: string) {
    super(`Invalid environment: ${summary}`);
    this.name = "EnvError";
    this.variables = variables;
  }
}

/** Parses an arbitrary source (tests pass a plain object). Throws EnvError naming the variables. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? "?");
    const missing = source[name] === undefined || source[name]?.trim() === "";
    return { name, text: `${name} ${missing ? "is required" : `is invalid (${issue.message})`}` };
  });
  throw new EnvError(
    [...new Set(problems.map((p) => p.name))],
    [...new Set(problems.map((p) => p.text))].join("; "),
  );
}

/**
 * Literal `process.env.X` reads: Next.js inlines NEXT_PUBLIC_* only for literal references, and
 * this keeps the list of variables the code reads greppable.
 */
function readProcessEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH,
    NEXT_PUBLIC_ENABLE_PHONE_AUTH: process.env.NEXT_PUBLIC_ENABLE_PHONE_AUTH,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_PROVIDER_API_KEY: process.env.AI_PROVIDER_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    GOOGLE_SITE_VERIFICATION: process.env.GOOGLE_SITE_VERIFICATION,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    PAYMENTS_DEMO_MODE: process.env.PAYMENTS_DEMO_MODE,
  };
}

let cached: Env | undefined;

/** The validated environment. Throws EnvError (naming the variables) when it is invalid. */
export function env(): Env {
  cached ??= parseEnv(readProcessEnv());
  return cached;
}

/** Test hook: forget the cached environment. */
export function resetEnvCache(): void {
  cached = undefined;
}

export type IntegrationName =
  | "service_role"
  | "ai"
  | "maps"
  | "email"
  | "redis"
  | "analytics"
  | "google_sign_in"
  | "phone_sign_in"
  | "whatsapp";

export type IntegrationStatus = Record<IntegrationName, { configured: boolean; mode: string }>;

/**
 * Which optional integrations are configured, and the mode each one runs in. Contains booleans
 * and fixed labels only: never keys, URLs, addresses or any other configured value.
 */
export function integrationStatus(source: Env = env()): IntegrationStatus {
  const on = (configured: boolean, whenOn: string, whenOff: string) => ({
    configured,
    mode: configured ? whenOn : whenOff,
  });
  const redis = Boolean(source.UPSTASH_REDIS_REST_URL && source.UPSTASH_REDIS_REST_TOKEN);
  const serviceRole = Boolean(source.SUPABASE_SERVICE_ROLE_KEY);
  return {
    service_role: on(serviceRole, "enabled", "disabled"),
    ai: on(Boolean(source.AI_PROVIDER_API_KEY), "provider", "basic"),
    maps: on(Boolean(source.GOOGLE_MAPS_API_KEY), "google", "openstreetmap"),
    email: on(Boolean(source.RESEND_API_KEY && source.EMAIL_FROM), "resend", "disabled"),
    redis: {
      configured: redis,
      mode: redis ? "upstash" : serviceRole ? "postgres" : "memory",
    },
    analytics: on(Boolean(source.NEXT_PUBLIC_GA_MEASUREMENT_ID), "ga4", "disabled"),
    google_sign_in: on(source.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH, "enabled", "disabled"),
    phone_sign_in: on(source.NEXT_PUBLIC_ENABLE_PHONE_AUTH, "enabled", "disabled"),
    whatsapp: on(Boolean(source.NEXT_PUBLIC_WHATSAPP_NUMBER), "enabled", "disabled"),
  };
}
