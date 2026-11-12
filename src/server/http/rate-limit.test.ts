// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { clientIp, MemoryRateLimiter, RATE_LIMITS, rateLimitKey, resolveRule } from "./rate-limit";

describe("MemoryRateLimiter (sliding window)", () => {
  it("allows up to max, then refuses with a retry hint", async () => {
    let now = 1_000_000;
    const limiter = new MemoryRateLimiter(() => now);
    const rule = { max: 3, windowSeconds: 10 };
    for (const remaining of [2, 1, 0]) {
      expect(await limiter.limit("k", rule)).toEqual({ allowed: true, limit: 3, remaining, retryAfterSeconds: 0 });
      now += 1000;
    }
    const refused = await limiter.limit("k", rule);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfterSeconds).toBe(7); // first hit at t0 leaves the window at t0 + 10s; now is t0 + 3s
  });

  it("slides: capacity returns as old hits leave the window, not all at once", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    const rule = { max: 2, windowSeconds: 10 };
    await limiter.limit("k", rule); // t=0
    now = 6000;
    await limiter.limit("k", rule); // t=6
    now = 9000;
    expect((await limiter.limit("k", rule)).allowed).toBe(false);
    now = 10_001; // the t=0 hit has left; the t=6 hit has not
    expect((await limiter.limit("k", rule)).allowed).toBe(true);
    expect((await limiter.limit("k", rule)).allowed).toBe(false);
  });

  it("refused attempts do not extend the block", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    const rule = { max: 1, windowSeconds: 5 };
    await limiter.limit("k", rule);
    for (now = 1000; now < 5000; now += 1000) expect((await limiter.limit("k", rule)).allowed).toBe(false);
    now = 5001;
    expect((await limiter.limit("k", rule)).allowed).toBe(true);
  });

  it("keeps keys and rules independent", async () => {
    const limiter = new MemoryRateLimiter(() => 0);
    const rule = { max: 1, windowSeconds: 60 };
    expect((await limiter.limit("a", rule)).allowed).toBe(true);
    expect((await limiter.limit("b", rule)).allowed).toBe(true);
    expect((await limiter.limit("a", rule)).allowed).toBe(false);
    expect((await limiter.limit("a", { max: 1, windowSeconds: 30 })).allowed).toBe(true);
  });

  it("bounds memory under a flood of distinct keys", async () => {
    const limiter = new MemoryRateLimiter(() => 0);
    for (let index = 0; index < 10_500; index += 1) await limiter.limit(`k${index}`, { max: 1, windowSeconds: 60 });
    expect(limiter.size).toBeLessThanOrEqual(10_000);
  });
});

describe("presets", () => {
  it("has the named presets with sane values", () => {
    expect(Object.keys(RATE_LIMITS).sort()).toEqual(["assistant", "auth", "contact", "mutation", "search", "upload"]);
    for (const rule of Object.values(RATE_LIMITS)) {
      expect(rule.max).toBeGreaterThan(0);
      expect(rule.windowSeconds).toBeGreaterThan(0);
    }
    expect(resolveRule("contact")).toBe(RATE_LIMITS.contact);
    expect(resolveRule({ max: 1, windowSeconds: 2 })).toEqual({ max: 1, windowSeconds: 2 });
  });
});

describe("clientIp", () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it("prefers the Vercel header, then x-real-ip, then the first x-forwarded-for entry", () => {
    expect(clientIp(headers({ "x-vercel-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2", "x-forwarded-for": "198.51.100.3" }))).toBe("198.51.100.1");
    expect(clientIp(headers({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "198.51.100.3" }))).toBe("198.51.100.2");
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("returns null for missing or malformed values", () => {
    expect(clientIp(headers({}))).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": "not an ip; drop table" }))).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": "1".repeat(100) }))).toBeNull();
  });
});

describe("rateLimitKey", () => {
  it("uses the user id when signed in, otherwise a hash of the IP", () => {
    expect(rateLimitKey("r", { userId: "u1", ip: "203.0.113.7" })).toBe("r:u:u1");
    const key = rateLimitKey("r", { ip: "203.0.113.7" });
    expect(key).toMatch(/^r:ip:[0-9a-f]{32}$/);
    expect(key).toBe(rateLimitKey("r", { ip: "203.0.113.7" }));
    expect(key).not.toBe(rateLimitKey("r", { ip: "203.0.113.8" }));
    expect(rateLimitKey("r", {})).toBe("r:ip:unknown");
  });
});
