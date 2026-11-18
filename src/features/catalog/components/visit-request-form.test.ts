import { describe, expect, it } from "vitest";

import { failureMessage } from "./visit-request-form";

describe("failureMessage", () => {
  it("shows the server's message for 429, 422 and 503", () => {
    for (const status of [429, 422, 503]) {
      expect(failureMessage({ status, message: "Server words." })).toBe("Server words.");
    }
  });
  it("falls back for network errors and other statuses", () => {
    expect(failureMessage({ status: 0 })).toMatch(/Check your connection/);
    expect(failureMessage({ status: 500, message: "internal" })).toMatch(/Check your connection/);
    expect(failureMessage({ status: 429 })).toMatch(/Check your connection/);
  });
});
