import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { contactRefusal } from "./store-error";

describe("contactRefusal", () => {
  it("turns the database rate limit into rate_limited", () => {
    const error = contactRefusal({ code: "ZV429", message: "Too many messages from this address." });
    expect(error?.code).toBe("rate_limited");
    expect(error?.status).toBe(429);
  });

  it("turns the database validation error into validation_failed with its message", () => {
    const error = contactRefusal({ code: "ZV422", message: "Please enter a valid e-mail address." });
    expect(error?.code).toBe("validation_failed");
    expect(error?.status).toBe(422);
    expect(error?.message).toBe("Please enter a valid e-mail address.");
  });

  it("lets an unreachable database fall through to e-mail only", () => {
    expect(contactRefusal({ code: "PGRST002", message: "schema cache" })).toBeNull();
    expect(contactRefusal(new TypeError("fetch failed"))).toBeNull();
    expect(contactRefusal({ code: "08006" })).toBeNull();
  });
});
