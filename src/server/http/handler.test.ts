// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

// The Supabase boundary and the session are mocked; everything else is the real code.
const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string | null; status: string; roles: string[]; intent: null; onboarding_completed_at: string | null },
  limiter: { kind: "memory", limit: vi.fn() },
  userClient: { tag: "user-client" },
  publicClient: { tag: "public-client" },
  sessionCalls: 0,
}));

vi.mock("@/server/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/env")>()),
  env: () => ({ NEXT_PUBLIC_SITE_URL: "https://zuvio.example" }),
}));
vi.mock("@/server/auth/session", () => ({
  getSession: vi.fn(async () => {
    state.sessionCalls += 1;
    return { supabase: state.userClient, userId: state.user?.id ?? null };
  }),
  getCurrentUser: vi.fn(async () => state.user),
}));
vi.mock("@/server/supabase/public", () => ({ createSupabasePublicClient: () => state.publicClient }));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => null }));
vi.mock("./rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./rate-limit")>()),
  getRateLimiter: () => state.limiter,
}));

import { createHandler } from "./handler";
import { errors } from "./errors";
import { ok } from "./response";

const USER_ID = "7b6f2c0e-58a5-4a57-9b1c-2f2f4f0f9a11";
const account = (overrides: Partial<NonNullable<typeof state.user>> = {}) => ({
  id: USER_ID,
  email: "person@example.com",
  status: "active",
  roles: ["seeker"],
  intent: null,
  onboarding_completed_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const segment = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const request = (method: string, init: { headers?: Record<string, string>; body?: unknown; url?: string } = {}) =>
  new Request(init.url ?? "https://zuvio.example/api/v1/things", {
    method,
    headers: {
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });

let logs: string[] = [];

beforeEach(() => {
  state.user = null;
  state.sessionCalls = 0;
  state.limiter.limit.mockReset();
  state.limiter.limit.mockResolvedValue({ allowed: true, limit: 10, remaining: 9, retryAfterSeconds: 0 });
  logs = [];
  for (const method of ["log", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((line: unknown) => void logs.push(String(line)));
  }
});

describe("createHandler: basics", () => {
  it("returns the handler's response with a fresh X-Request-Id and passes a typed context", async () => {
    const handler = createHandler({ auth: "public" }, async (ctx) => {
      expect(ctx.user).toBeNull();
      expect(ctx.supabase).toBe(state.publicClient);
      return ok({ request_id: ctx.requestId });
    });
    const first = await handler(request("GET"), segment());
    const second = await handler(request("GET"), segment());
    const body = await first.json();
    expect(first.status).toBe(200);
    expect(first.headers.get("x-request-id")).toBe(body.data.request_id);
    expect(first.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.headers.get("x-request-id")).not.toBe(first.headers.get("x-request-id"));
  });

  it("does not read the session for public routes", async () => {
    await createHandler({ auth: "public" }, async () => ok(null))(request("GET"), segment());
    expect(state.sessionCalls).toBe(0);
  });

  it("ignores a client-supplied request id", async () => {
    const response = await createHandler({ auth: "public" }, async () => ok(null))(
      request("GET", { headers: { "x-request-id": "attacker-chosen" } }),
      segment(),
    );
    expect(response.headers.get("x-request-id")).not.toBe("attacker-chosen");
  });
});

describe("createHandler: authentication and roles", () => {
  it("401 for a signed-out caller on a user route, and the handler does not run", async () => {
    const fn = vi.fn(async () => ok(null));
    const response = await createHandler({ auth: "user" }, fn)(request("GET"), segment());
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthenticated");
    expect(fn).not.toHaveBeenCalled();
  });

  it("passes the verified user and the user-scoped client", async () => {
    state.user = account();
    const response = await createHandler({ auth: "user" }, async (ctx) => {
      expect(ctx.supabase).toBe(state.userClient);
      return ok({ id: ctx.user.id });
    })(request("GET"), segment());
    expect((await response.json()).data.id).toBe(USER_ID);
  });

  it("optional auth works signed out and signed in", async () => {
    const handler = createHandler({ auth: "optional" }, async (ctx) => ok({ id: ctx.user?.id ?? null }));
    expect((await (await handler(request("GET"), segment())).json()).data.id).toBeNull();
    state.user = account();
    expect((await (await handler(request("GET"), segment())).json()).data.id).toBe(USER_ID);
  });

  it("suspended users get `restricted` (403) unless the route allows them", async () => {
    state.user = account({ status: "suspended" });
    const blocked = await createHandler({ auth: "user" }, async () => ok(null))(request("GET"), segment());
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe("restricted");

    const allowed = await createHandler({ auth: "user", allowSuspended: true }, async () => ok(null))(request("GET"), segment());
    expect(allowed.status).toBe(200);
  });

  it.each([
    ["owner", ["seeker"], 403],
    ["owner", ["seeker", "owner"], 200],
    ["staff", ["seeker", "owner"], 403],
    ["staff", ["moderator"], 200],
    ["staff", ["admin"], 200],
    ["admin", ["moderator"], 403],
    ["admin", ["admin"], 200],
  ] as const)("%s route with roles %j -> %i", async (auth, roles, status) => {
    state.user = account({ roles: [...roles] });
    const response = await createHandler({ auth }, async () => ok(null))(request("GET"), segment());
    expect(response.status).toBe(status);
    if (status === 403) expect((await response.json()).error.code).toBe("forbidden");
  });

  it("a suspended admin is not staff", async () => {
    state.user = account({ roles: ["admin"], status: "suspended" });
    const response = await createHandler({ auth: "admin" }, async () => ok(null))(request("GET"), segment());
    expect(response.status).toBe(403);
  });
});

describe("createHandler: same-origin check on mutating methods", () => {
  const handler = createHandler({ auth: "public", rateLimit: false }, async () => ok(null));

  it.each([
    ["site origin", { origin: "https://zuvio.example" }, 200],
    ["host match (preview deployment)", { origin: "https://preview-1.vercel.app", host: "preview-1.vercel.app" }, 200],
    ["forwarded host match", { origin: "https://app.example", "x-forwarded-host": "app.example", host: "internal:3000" }, 200],
    ["no Origin, same-origin fetch metadata", { "sec-fetch-site": "same-origin" }, 200],
    ["no browser headers at all (server-to-server)", {}, 200],
    ["foreign Origin", { origin: "https://evil.example" }, 403],
    ["foreign Origin even with same-origin metadata claim", { origin: "https://evil.example", "sec-fetch-site": "same-origin" }, 403],
    ["Origin: null (sandboxed frame)", { origin: "null" }, 403],
    ["look-alike origin", { origin: "https://zuvio.example.evil.com" }, 403],
    ["scheme-only difference to a foreign host", { origin: "http://evil.example" }, 403],
    ["cross-site fetch metadata without Origin", { "sec-fetch-site": "cross-site" }, 403],
    ["same-site (sibling subdomain) fetch metadata", { "sec-fetch-site": "same-site" }, 403],
  ] as const)("POST with %s -> %i", async (_name, headers, status) => {
    const response = await handler(request("POST", { headers: { ...headers } }), segment());
    expect(response.status).toBe(status);
    if (status === 403) expect((await response.json()).error.code).toBe("forbidden");
  });

  it("does not apply to GET", async () => {
    const response = await handler(request("GET", { headers: { origin: "https://evil.example" } }), segment());
    expect(response.status).toBe(200);
  });

  it("is checked before authentication and before the handler runs", async () => {
    const fn = vi.fn(async () => ok(null));
    const response = await createHandler({ auth: "user" }, fn)(
      request("DELETE", { headers: { origin: "https://evil.example" } }),
      segment(),
    );
    expect(response.status).toBe(403);
    expect(state.sessionCalls).toBe(0);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("createHandler: validation", () => {
  const schema = z.object({ name: z.string().min(2, "Name is too short"), age: z.number().int().optional() });

  it("422 with field details for an invalid body", async () => {
    const fn = vi.fn(async () => ok(null));
    const response = await createHandler({ auth: "public", rateLimit: false, body: schema }, fn)(
      request("POST", { body: { name: "a", age: 1.5 } }),
      segment(),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.details.fieldErrors.name).toEqual(["Name is too short"]);
    expect(body.error.details.fieldErrors.age).toHaveLength(1);
    expect(body.error.request_id).toBe(response.headers.get("x-request-id"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("passes the parsed body", async () => {
    const response = await createHandler({ auth: "public", rateLimit: false, body: schema }, async ({ body }) => ok(body))(
      request("POST", { body: { name: "  ok", extra: "dropped" } }),
      segment(),
    );
    expect((await response.json()).data).toEqual({ name: "  ok" });
  });

  it.each([
    ["malformed JSON", { body: "{not json", headers: { "content-type": "application/json" } }],
    ["wrong content type", { body: "name=a", headers: { "content-type": "application/x-www-form-urlencoded" } }],
    ["empty body", { body: "", headers: { "content-type": "application/json" } }],
  ])("400 for %s", async (_name, init) => {
    const response = await createHandler({ auth: "public", rateLimit: false, body: schema }, async () => ok(null))(
      new Request("https://zuvio.example/api/v1/things", { method: "POST", ...init }),
      segment(),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("bad_request");
  });

  it("400 for an oversized body", async () => {
    const response = await createHandler(
      { auth: "public", rateLimit: false, body: z.object({ text: z.string() }), maxBodyBytes: 50 },
      async () => ok(null),
    )(request("POST", { body: { text: "x".repeat(200) } }), segment());
    expect(response.status).toBe(400);
  });

  it("validates and coerces the query string, with repeated keys as arrays", async () => {
    const handler = createHandler(
      {
        auth: "public",
        query: z.object({
          page: z.coerce.number().int().min(1).default(1),
          type: z.union([z.string(), z.array(z.string())]).optional(),
        }),
      },
      async ({ query }) => ok(query),
    );
    const good = await handler(request("GET", { url: "https://zuvio.example/api/v1/things?page=3&type=pg&type=flat" }), segment());
    expect((await good.json()).data).toEqual({ page: 3, type: ["pg", "flat"] });
    const bad = await handler(request("GET", { url: "https://zuvio.example/api/v1/things?page=0" }), segment());
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.details.fieldErrors.page).toHaveLength(1);
  });

  it("validates route params", async () => {
    const handler = createHandler({ auth: "public", params: z.object({ id: z.uuid() }) }, async ({ params }) => ok(params));
    expect((await handler(request("GET"), segment({ id: "nope" }))).status).toBe(422);
    const response = await handler(request("GET"), segment({ id: USER_ID }));
    expect((await response.json()).data).toEqual({ id: USER_ID });
  });
});

describe("createHandler: rate limiting", () => {
  it("429 with Retry-After when the limiter refuses, and the handler does not run", async () => {
    state.limiter.limit.mockResolvedValue({ allowed: false, limit: 5, remaining: 0, retryAfterSeconds: 120 });
    const fn = vi.fn(async () => ok(null));
    const response = await createHandler({ auth: "public", rateLimit: "contact", label: "contact.submit" }, fn)(
      request("POST", { headers: { "x-forwarded-for": "203.0.113.9" }, body: {} }),
      segment(),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect((await response.json()).error.code).toBe("rate_limited");
    expect(fn).not.toHaveBeenCalled();
  });

  it("keys anonymous callers by hashed IP and route label, with the preset's rule", async () => {
    await createHandler({ auth: "public", rateLimit: "contact", label: "contact.submit" }, async () => ok(null))(
      request("POST", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }),
      segment(),
    );
    const [key, rule] = state.limiter.limit.mock.calls[0]!;
    expect(key).toMatch(/^contact\.submit:ip:[0-9a-f]{32}$/);
    expect(key).not.toContain("203.0.113.9");
    expect(rule).toEqual({ max: 5, windowSeconds: 3600 });
  });

  it("keys signed-in callers by user id", async () => {
    state.user = account();
    await createHandler({ auth: "user", rateLimit: { max: 3, windowSeconds: 10 }, label: "x" }, async () => ok(null))(
      request("POST", { headers: { "x-forwarded-for": "203.0.113.9" } }),
      segment(),
    );
    expect(state.limiter.limit.mock.calls[0]).toEqual([`x:u:${USER_ID}`, { max: 3, windowSeconds: 10 }]);
  });

  it("defaults: mutation preset for writes, none for reads, off when false", async () => {
    const handler = createHandler({ auth: "public" }, async () => ok(null));
    await handler(request("GET"), segment());
    expect(state.limiter.limit).not.toHaveBeenCalled();
    await handler(request("POST"), segment());
    expect(state.limiter.limit.mock.calls[0]![1]).toEqual({ max: 30, windowSeconds: 60 });
    expect(state.limiter.limit.mock.calls[0]![0]).toMatch(/^POST \/api\/v1\/things:ip:/);
    state.limiter.limit.mockClear();
    await createHandler({ auth: "public", rateLimit: false }, async () => ok(null))(request("POST"), segment());
    expect(state.limiter.limit).not.toHaveBeenCalled();
  });
});

describe("createHandler: error mapping and logging", () => {
  it("maps a thrown AppError", async () => {
    const response = await createHandler({ auth: "public" }, async () => {
      throw errors.conflict("You have already saved this listing.");
    })(request("GET"), segment());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: "conflict", message: "You have already saved this listing." });
  });

  it("maps a database error thrown by a repository (ZV423 -> restricted)", async () => {
    const response = await createHandler({ auth: "public" }, async () => {
      throw { code: "ZV423", message: "Messaging is restricted on your account.", details: null, hint: null };
    })(request("GET"), segment());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatchObject({ code: "restricted", message: "Messaging is restricted on your account." });
  });

  it("maps an unexpected error to 500 without leaking it, and logs it as structured JSON", async () => {
    const response = await createHandler({ auth: "public", label: "things.list" }, async () => {
      throw new Error("boom: token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk for someone@example.com");
    })(request("GET"), segment());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("boom");

    const line = JSON.parse(logs.find((entry) => entry.includes("request.failed"))!);
    expect(line).toMatchObject({ level: "error", msg: "request.failed", route: "things.list", code: "internal", status: 500 });
    expect(line.request_id).toBe(response.headers.get("x-request-id"));
    expect(JSON.stringify(line)).not.toContain("someone@example.com");
    expect(JSON.stringify(line)).not.toContain("eyJhbGci");
  });

  it("never logs the request body or headers on failure", async () => {
    await createHandler({ auth: "public", rateLimit: false, body: z.object({ email: z.email() }) }, async () => ok(null))(
      request("POST", { body: { email: "not-an-email-but-private-9876543210" }, headers: { authorization: "Bearer secret-token-value" } }),
      segment(),
    );
    const all = logs.join("\n");
    expect(all).toContain("request.rejected");
    expect(all).not.toContain("private-9876543210");
    expect(all).not.toContain("secret-token-value");
  });
});
