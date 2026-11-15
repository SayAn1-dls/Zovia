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
});
