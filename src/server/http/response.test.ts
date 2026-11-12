// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { errors } from "./errors";
import { clampPagination, cursorMeta, decodeCursor, encodeCursor, pageMeta, paginationSchema, paginationWith, toRange } from "./pagination";
import { created, fail, ok } from "./response";

describe("envelope helpers", () => {
  it("ok() produces { ok: true, data } with no-store and the request id", async () => {
    const response = ok({ id: 1 }, { requestId: "req-1" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("req-1");
    expect(await response.json()).toEqual({ ok: true, data: { id: 1 } });
  });

  it("ok() includes meta when given and honours status and headers", async () => {
    const meta = { page: 2, limit: 10, total: 35, has_more: true };
    const response = ok([1], { meta, status: 206, headers: { "Cache-Control": "public, max-age=60" } });
    expect(response.status).toBe(206);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await response.json()).toEqual({ ok: true, data: [1], meta });
  });

  it("created() is 201", () => {
    expect(created({}).status).toBe(201);
  });

  it("fail() produces the exact failure envelope and status", async () => {
    const response = fail(errors.notFound("Listing not found."), "req-2");
    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toBe("req-2");
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "not_found", message: "Listing not found.", request_id: "req-2" },
    });
  });

  it("fail() includes details and Retry-After when present", async () => {
    const validation = fail(errors.validation({ formErrors: [], fieldErrors: { name: ["Required"] } }), "r");
    expect(validation.status).toBe(422);
    expect((await validation.json()).error.details).toEqual({ formErrors: [], fieldErrors: { name: ["Required"] } });

    const limited = fail(errors.rateLimited(41.2), "r");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");
  });

  it("fail() never leaks an unknown error's message", async () => {
    const response = fail(new Error("connection string postgres://user:pw@host"), "r");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("postgres://");
  });
});

describe("pagination", () => {
  it("defaults, coerces and caps", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationSchema.parse({ page: "3", limit: "50" })).toEqual({ page: 3, limit: 50 });
    expect(paginationSchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: "0" }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: "abc" }).success).toBe(false);
    expect(z.object(paginationWith({ maxLimit: 100, defaultLimit: 30 })).parse({})).toEqual({ page: 1, limit: 30 });
  });

  it("clampPagination never throws", () => {
    expect(clampPagination({ page: "-4", limit: "999" })).toEqual({ page: 1, limit: 50 });
    expect(clampPagination({ page: "x" })).toEqual({ page: 1, limit: 20 });
  });

  it("toRange and pageMeta", () => {
    expect(toRange({ page: 1, limit: 20 })).toEqual({ from: 0, to: 19, offset: 0 });
    expect(toRange({ page: 3, limit: 10 })).toEqual({ from: 20, to: 29, offset: 20 });
    expect(pageMeta({ page: 1, limit: 20 }, 21)).toEqual({ page: 1, limit: 20, total: 21, has_more: true });
    expect(pageMeta({ page: 2, limit: 20 }, 40)).toEqual({ page: 2, limit: 20, total: 40, has_more: false });
    expect(pageMeta({ page: 1, limit: 20 }, 0).has_more).toBe(false);
  });

  it("cursor helpers round-trip and reject garbage", () => {
    const schema = z.object({ t: z.string(), id: z.string() });
    const cursor = encodeCursor({ t: "2026-01-01", id: "a" });
    expect(decodeCursor(cursor, schema)).toEqual({ t: "2026-01-01", id: "a" });
    expect(decodeCursor("%%%", schema)).toBeNull();
    expect(decodeCursor(encodeCursor({ t: 1 }), schema)).toBeNull();
    expect(decodeCursor(null, schema)).toBeNull();
    expect(cursorMeta(undefined)).toEqual({ next_cursor: null });
  });
});
