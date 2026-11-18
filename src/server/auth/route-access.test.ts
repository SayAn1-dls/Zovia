// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { config } from "@/proxy";

import { ONBOARDING_EXEMPT_PREFIXES, PRIVATE_PREFIXES, decideRoute, type RouteUser } from "./route-access";

const user = (over: Partial<RouteUser> = {}): RouteUser => ({ status: "active", roles: ["seeker"], onboarded: true, ...over });
const decide = (pathname: string, who: RouteUser | null | "unknown", search = "") => decideRoute({ pathname, search, user: who });

describe("decideRoute", () => {
  it("leaves public pages alone", () => {
    expect(decide("/search", null)).toEqual({ kind: "next" });
  });

  it("sends signed-out visitors to sign-in and back, including the /book query", () => {
    expect(decide("/book/sunrise-pg", null, "?checkin=2026-12-01&rooms=single@1")).toEqual({
      kind: "redirect",
      to: `/sign-in?next=${encodeURIComponent("/book/sunrise-pg?checkin=2026-12-01&rooms=single@1")}`,
    });
  });

  it("sends a not-yet-onboarded account to onboarding from other private pages", () => {
    const fresh = user({ onboarded: false });
    expect(decide("/saved", fresh)).toMatchObject({ kind: "redirect", to: expect.stringContaining("/onboarding") });
    expect(decide("/roommates", fresh)).toMatchObject({ kind: "redirect", to: expect.stringContaining("/onboarding") });
    expect(decide("/onboarding", fresh)).toEqual({ kind: "next" });
  });

  it("lets a not-yet-onboarded account book and see its bookings", () => {
    const fresh = user({ onboarded: false });
    expect(decide("/book/sunrise-pg", fresh)).toEqual({ kind: "next" });
    expect(decide("/bookings", fresh)).toEqual({ kind: "next" });
    expect(decide("/bookings/6b2f2d4e-0000-4000-8000-000000000001", fresh)).toEqual({ kind: "next" });
    expect(decide("/bookings/6b2f2d4e-0000-4000-8000-000000000001/invoice", fresh)).toEqual({ kind: "next" });
    // the exemption is exact: a lookalike prefix is not exempt
    expect(decide("/bookmarks", fresh)).toEqual({ kind: "next" }); // not private at all
  });

  it("still blocks suspended accounts and non-owners from /owner", () => {
    expect(decide("/book/x", user({ status: "suspended" }))).toEqual({ kind: "redirect", to: "/account/suspended" });
    expect(decide("/owner/properties", user())).toMatchObject({ kind: "redirect", to: "/list-your-property" });
    expect(decide("/admin", user())).toEqual({ kind: "not_found" });
  });

  it("only exempts paths that are private prefixes", () => {
    for (const prefix of ONBOARDING_EXEMPT_PREFIXES) expect(PRIVATE_PREFIXES).toContain(prefix);
  });
});

describe("proxy matcher", () => {
  it("matches the private prefixes exactly", () => {
    expect([...config.matcher].sort()).toEqual(PRIVATE_PREFIXES.map((prefix) => `${prefix}/:path*`).sort());
  });
});
