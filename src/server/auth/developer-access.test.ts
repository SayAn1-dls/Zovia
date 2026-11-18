// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isDeveloperEmail, restrictStaffRoles } from "./developer-access";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("developer-only staff access", () => {
  it("keeps staff roles only for allowlisted e-mails (case-insensitive)", () => {
    vi.stubEnv("ADMIN_EMAILS", "dev@zovia.app, Second@Zovia.app");
    expect(restrictStaffRoles(["seeker", "admin", "moderator"], "DEV@zovia.app")).toEqual(["seeker", "admin", "moderator"]);
    expect(restrictStaffRoles(["seeker", "owner", "admin"], "someone@else.com")).toEqual(["seeker", "owner"]);
    expect(isDeveloperEmail("second@zovia.app")).toBe(true);
  });

  it("does not grant admin for e-mails that merely contain the word admin", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isDeveloperEmail("admin@attacker.com")).toBe(false);
    expect(restrictStaffRoles(["admin"], null)).toEqual([]);
    expect(isDeveloperEmail("sayanbhattacharya2024@gmail.com")).toBe(true);
  });

  it("strips quotes and whitespace around each entry", () => {
    vi.stubEnv("ADMIN_EMAILS", ' "a@b.com" , \'C@d.com\' ,\u201cE@f.com\u201d ');
    expect(isDeveloperEmail("a@b.com")).toBe(true);
    expect(isDeveloperEmail("c@d.com")).toBe(true);
    expect(isDeveloperEmail("e@f.com")).toBe(true);
    expect(isDeveloperEmail("sayanbhattacharya2024@gmail.com")).toBe(false);
  });

  it("falls back to the default when the value is only quotes", () => {
    vi.stubEnv("ADMIN_EMAILS", '""');
    expect(isDeveloperEmail("sayanbhattacharya2024@gmail.com")).toBe(true);
  });
});
