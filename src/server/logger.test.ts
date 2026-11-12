// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logger, redact, redactString, serializeError } from "./logger";

afterEach(() => vi.restoreAllMocks());

describe("redaction", () => {
  it("replaces values of sensitive keys at any depth", () => {
    const out = redact({
      password: "hunter2",
      access_token: "abc",
      refresh_token: "def",
      Authorization: "Bearer abc",
      cookie: "sb-auth=1",
      apiKey: "k",
      api_key: "k",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_x",
      email: "a@b.co",
      phone: "9876543210",
      body: { anything: 1 },
      nested: { user: { contact_email: "c@d.co", whatsapp_number: "1", id: "u1" } },
      list: [{ otp: "123456", ok: true }],
    }) as Record<string, unknown>;
    expect(out.password).toBe("[redacted]");
    expect(out.access_token).toBe("[redacted]");
    expect(out.refresh_token).toBe("[redacted]");
    expect(out.Authorization).toBe("[redacted]");
    expect(out.cookie).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.api_key).toBe("[redacted]");
    expect(out.SUPABASE_SERVICE_ROLE_KEY).toBe("[redacted]");
    expect(out.email).toBe("[redacted]");
    expect(out.phone).toBe("[redacted]");
    expect(out.body).toBe("[redacted]");
    expect(out.nested).toEqual({ user: { contact_email: "[redacted]", whatsapp_number: "[redacted]", id: "u1" } });
    expect(out.list).toEqual([{ otp: "[redacted]", ok: true }]);
  });

  it("keeps ordinary operational fields", () => {
    const fields = { request_id: "r1", user_id: "7b6f2c0e-58a5-4a57-9b1c-2f2f4f0f9a11", route: "contact.submit", status: 429, code: "rate_limited", latency_ms: 12 };
    expect(redact(fields)).toEqual(fields);
  });

  it("masks e-mail addresses, JWTs, keys and phone-like numbers inside strings", () => {
    expect(redactString("mail from jane.doe+x@example.co.in failed")).toBe("mail from [email] failed");
    expect(redactString("jwt eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVl rejected")).toBe("jwt [jwt] rejected");
    expect(redactString("key sb_secret_abcdefghijkl used")).toBe("key [key] used");
    expect(redactString("call +91 98765 43210 now")).toBe("call [number] now");
    expect(redactString("call 9876543210")).toBe("call [number]");
  });

  it("does not mangle ids, short numbers or timestamps", () => {
    const uuid = "7b6f2c0e-58a5-4a57-9b1c-2f2f4f0f9a11";
    expect(redactString(`user ${uuid} status 404 took 1234 ms`)).toBe(`user ${uuid} status 404 took 1234 ms`);
    expect(redactString("at 2026-11-11T10:20:30.000Z")).toBe("at 2026-11-11T10:20:30.000Z");
  });

  it("handles cycles, depth and odd values", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(redact(cyclic)).toEqual({ a: 1, self: "[circular]" });
    expect(redact({ fn: () => 1, big: BigInt(5), when: new Date(0), nothing: null })).toEqual({
      fn: undefined,
      big: "5",
      when: "1970-01-01T00:00:00.000Z",
      nothing: null,
    });
  });

  it("serializes errors with a redacted message", () => {
    const error = Object.assign(new Error("failed for a@b.co"), { code: "23505" });
    expect(serializeError(error)).toMatchObject({ name: "Error", message: "failed for [email]", code: "23505" });
    expect(serializeError({ code: "ZV429", message: "slow down" })).toEqual({ name: "NonError", code: "ZV429", message: "slow down" });
    expect(serializeError("text")).toEqual({ name: "NonError", message: "text" });
  });
});

describe("logger", () => {
  it("writes one JSON line with level, msg, time and fields, routed by level", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.info("thing.happened", { request_id: "r1", count: 2 });
    logger.warn("thing.odd");
    logger.error("thing.failed", { error: new Error("x") });

    const line = JSON.parse(log.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ level: "info", msg: "thing.happened", request_id: "r1", count: 2 });
    expect(Number.isNaN(Date.parse(line.time))).toBe(false);
    expect(JSON.parse(warn.mock.calls[0]![0] as string).level).toBe("warn");
    expect(JSON.parse(error.mock.calls[0]![0] as string).error.name).toBe("Error");
  });

  it("child loggers add bound fields and still redact", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.child({ request_id: "r9", route: "x" }).info("hello", { token: "secret", note: "to a@b.co" });
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
      request_id: "r9",
      route: "x",
      token: "[redacted]",
      note: "to [email]",
    });
  });
});
