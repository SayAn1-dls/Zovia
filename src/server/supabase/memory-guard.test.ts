// @vitest-environment node
import { describe, expect, it } from "vitest";

import { assertMemoryBackendAllowed, memoryMayAutoGrantAdmin } from "./memory-guard";

describe("memory backend guard", () => {
  it("is allowed locally", () => {
    expect(() => assertMemoryBackendAllowed({})).not.toThrow();
    expect(memoryMayAutoGrantAdmin({})).toBe(true);
  });

  it("throws a clear error on Vercel unless explicitly allowed", () => {
    expect(() => assertMemoryBackendAllowed({ VERCEL: "1" })).toThrow(/Supabase configured|without Supabase/);
    expect(() => assertMemoryBackendAllowed({ VERCEL: "1", ALLOW_MEMORY_IN_PRODUCTION: "1" })).not.toThrow();
  });

  it("never auto-grants admin on Vercel, even with the override", () => {
    expect(memoryMayAutoGrantAdmin({ VERCEL: "1", ALLOW_MEMORY_IN_PRODUCTION: "1" })).toBe(false);
  });
});
