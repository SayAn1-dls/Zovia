// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { EnvError } from "@/server/env";

import { AppError, errors, fromSupabaseError, toAppError, unwrap, unwrapOrNotFound, validationDetails } from "./errors";

describe("AppError", () => {
  it.each([
    ["bad_request", 400],
    ["unauthenticated", 401],
    ["forbidden", 403],
    ["restricted", 403],
    ["not_found", 404],
    ["conflict", 409],
    ["validation_failed", 422],
    ["rate_limited", 429],
    ["unavailable", 503],
    ["internal", 500],
  ] as const)("%s -> %i with a default message", (code, status) => {
    const error = new AppError(code);
    expect(error.status).toBe(status);
    expect(error.message.length).toBeGreaterThan(10);
  });
});

describe("fromSupabaseError: ZV contract", () => {
  it.each([
    ["ZV400", "bad_request", 400],
    ["ZV401", "unauthenticated", 401],
    ["ZV403", "forbidden", 403],
    ["ZV404", "not_found", 404],
    ["ZV409", "conflict", 409],
    ["ZV422", "validation_failed", 422],
    ["ZV423", "restricted", 403],
    ["ZV429", "rate_limited", 429],
  ] as const)("%s -> %s (%i) and keeps the user-safe message", (sqlstate, code, status) => {
    const error = fromSupabaseError({ code: sqlstate, message: "Message from the function.", details: null, hint: null });
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
    expect(error.message).toBe("Message from the function.");
  });
});

describe("fromSupabaseError: Postgres / PostgREST", () => {
  it.each([
    ["23505", "conflict"],
    ["23503", "conflict"],
    ["23514", "validation_failed"],
    ["23502", "validation_failed"],
    ["22P02", "bad_request"],
    ["42501", "forbidden"],
    ["PGRST116", "not_found"],
    ["PGRST301", "unauthenticated"],
    ["57014", "unavailable"],
    ["PGRST002", "unavailable"],
  ] as const)("%s -> %s and hides the database message", (code, expected) => {
    const raw = 'duplicate key value violates unique constraint "users_email_key" Key (email)=(a@b.co)';
    const error = fromSupabaseError({ code, message: raw });
    expect(error.code).toBe(expected);
    expect(error.message).not.toContain("users_email_key");
    expect(error.message).not.toContain("a@b.co");
    expect((error.cause as { message: string }).message).toBe(raw);
  });

  it("maps RLS violations (42501) to forbidden", () => {
    const error = fromSupabaseError({ code: "42501", message: 'new row violates row-level security policy for table "x"' });
    expect(error.status).toBe(403);
  });

  it("maps storage/auth HTTP statuses", () => {
    expect(fromSupabaseError({ status: 401, message: "x" }).code).toBe("unauthenticated");
    expect(fromSupabaseError({ statusCode: "404", message: "Object not found" }).code).toBe("not_found");
    expect(fromSupabaseError({ statusCode: "413", message: "too big" }).code).toBe("validation_failed");
    expect(fromSupabaseError({ status: 429, message: "x" }).code).toBe("rate_limited");
  });

  it("maps network failures and timeouts to unavailable", () => {
    expect(fromSupabaseError({ message: "TypeError: fetch failed" }).code).toBe("unavailable");
    expect(fromSupabaseError(new DOMException("timed out", "TimeoutError")).code).toBe("unavailable");
  });

  it("maps anything unknown to internal with a generic message", () => {
    const error = fromSupabaseError({ code: "XX000", message: "internal detail about table secrets" });
    expect(error.code).toBe("internal");
    expect(error.message).not.toContain("secrets");
    expect(fromSupabaseError("boom").code).toBe("internal");
    expect(fromSupabaseError(null).code).toBe("internal");
  });
});

describe("toAppError", () => {
  it("passes AppError through", () => {
    const original = errors.notFound("Listing not found.");
    expect(toAppError(original)).toBe(original);
  });

  it("turns a ZodError into validation_failed with field details", () => {
    const result = z.object({ name: z.string().min(2, "Too short"), age: z.number() }).safeParse({ name: "a" });
    const error = toAppError(result.error);
    expect(error.code).toBe("validation_failed");
    expect(error.details).toEqual({
      formErrors: [],
      fieldErrors: { name: ["Too short"], age: [expect.any(String)] },
    });
  });

  it("turns a configuration error into unavailable without naming variables to the client", () => {
    const error = toAppError(new EnvError(["NEXT_PUBLIC_SUPABASE_URL"], "NEXT_PUBLIC_SUPABASE_URL is required"));
    expect(error.code).toBe("unavailable");
    expect(error.message).not.toContain("SUPABASE");
  });

  it("turns a plain Error into internal", () => {
    const error = toAppError(new Error("database password is hunter2"));
    expect(error.code).toBe("internal");
    expect(error.message).not.toContain("hunter2");
  });
});

describe("validationDetails", () => {
  it("joins nested paths with dots and collects form-level errors", () => {
    const schema = z
      .object({ rooms: z.array(z.object({ rent: z.number().min(1, "Rent must be positive") })) })
      .refine(() => false, "Form is inconsistent");
    const result = schema.safeParse({ rooms: [{ rent: 0 }] });
    expect(validationDetails(result.error!)).toEqual({
      formErrors: ["Form is inconsistent"],
      fieldErrors: { "rooms.0.rent": ["Rent must be positive"] },
    });
  });
});

describe("unwrap", () => {
  it("returns data or throws the mapped error", () => {
    expect(unwrap({ data: 1, error: null })).toBe(1);
    expect(() => unwrap({ data: null, error: { code: "ZV404", message: "Nope." } })).toThrow("Nope.");
    expect(() => unwrapOrNotFound({ data: null, error: null }, "Listing not found.")).toThrow("Listing not found.");
    expect(unwrapOrNotFound({ data: { id: 1 }, error: null })).toEqual({ id: 1 });
  });
});
