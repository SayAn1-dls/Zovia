// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EnvError, integrationStatus, parseEnv } from "./env";

const required = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000/",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
};

describe("parseEnv", () => {
  it("accepts the three required variables and strips trailing slashes", () => {
    const env = parseEnv(required);
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH).toBe(false);
  });

  it("names every missing required variable and never echoes values", () => {
    try {
      parseEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "", NEXT_PUBLIC_SITE_URL: "not a url secret-value" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const envError = error as EnvError;
      expect(envError.variables.sort()).toEqual([
        "NEXT_PUBLIC_SITE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "NEXT_PUBLIC_SUPABASE_URL",
      ]);
      expect(envError.message).toContain("NEXT_PUBLIC_SUPABASE_URL is required");
      expect(envError.message).toContain("NEXT_PUBLIC_SITE_URL is invalid");
      expect(envError.message).not.toContain("secret-value");
    }
  });

  it("rejects non-http URLs", () => {
    expect(() => parseEnv({ ...required, NEXT_PUBLIC_SUPABASE_URL: "ftp://x.example" })).toThrow(EnvError);
  });

  it("treats empty strings as unset and parses flags strictly", () => {
    const env = parseEnv({
      ...required,
      SUPABASE_SERVICE_ROLE_KEY: "   ",
      RESEND_API_KEY: "",
      UPSTASH_REDIS_REST_URL: "",
      NEXT_PUBLIC_SUPPORT_EMAIL: "",
      NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: "TRUE",
      NEXT_PUBLIC_ENABLE_PHONE_AUTH: "yes",
    });
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(env.NEXT_PUBLIC_SUPPORT_EMAIL).toBeUndefined();
    expect(env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH).toBe(true);
    expect(env.NEXT_PUBLIC_ENABLE_PHONE_AUTH).toBe(false);
  });

  it("rejects a malformed optional value", () => {
    expect(() => parseEnv({ ...required, NEXT_PUBLIC_SUPPORT_EMAIL: "nope" })).toThrow(/NEXT_PUBLIC_SUPPORT_EMAIL/);
    expect(() => parseEnv({ ...required, UPSTASH_REDIS_REST_URL: "nope" })).toThrow(/UPSTASH_REDIS_REST_URL/);
  });
});

describe("integrationStatus", () => {
  it("reports everything off with only the required variables", () => {
    const status = integrationStatus(parseEnv(required));
    expect(Object.keys(status).sort()).toEqual(
      ["ai", "analytics", "email", "google_sign_in", "maps", "phone_sign_in", "redis", "service_role", "whatsapp"].sort(),
    );
    for (const entry of Object.values(status)) expect(entry.configured).toBe(false);
    expect(status.redis.mode).toBe("memory");
    expect(status.ai.mode).toBe("basic");
    expect(status.maps.mode).toBe("openstreetmap");
  });

  it("reports configured integrations without leaking any value", () => {
    const secrets = {
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_AAAA",
      AI_PROVIDER: "anthropic",
      AI_PROVIDER_API_KEY: "sk-ant-BBBB",
      GOOGLE_MAPS_API_KEY: "maps-CCCC",
      RESEND_API_KEY: "re_DDDD",
      EMAIL_FROM: "ZUVIO <hello@zuvio.example>",
      UPSTASH_REDIS_REST_URL: "https://redis.example.com",
      UPSTASH_REDIS_REST_TOKEN: "tok-EEEE",
      NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-FFFF",
      NEXT_PUBLIC_WHATSAPP_NUMBER: "919999999999",
      NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: "true",
      NEXT_PUBLIC_ENABLE_PHONE_AUTH: "true",
    };
    const status = integrationStatus(parseEnv({ ...required, ...secrets }));
    for (const entry of Object.values(status)) expect(entry.configured).toBe(true);
    expect(status.redis.mode).toBe("upstash");
    const serialized = JSON.stringify(status);
    for (const value of Object.values(secrets)) {
      if (value !== "true") expect(serialized).not.toContain(value);
    }
  });

  it("needs both halves of a pair", () => {
    const status = integrationStatus(
      parseEnv({ ...required, RESEND_API_KEY: "re_x", UPSTASH_REDIS_REST_URL: "https://r.example.com", SUPABASE_SERVICE_ROLE_KEY: "k" }),
    );
    expect(status.email.configured).toBe(false);
    expect(status.redis).toEqual({ configured: false, mode: "postgres" });
  });
});
