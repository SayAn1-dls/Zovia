import { AuthApiError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toAuthAppError } from "./repository";

describe("toAuthAppError rate limits", () => {
  it("gives the e-mail quota its own message and a 429", () => {
    const error = toAuthAppError(new AuthApiError("email rate limit exceeded", 429, "over_email_send_rate_limit"));
    expect(error.status).toBe(429);
    expect(error.message).toBe("We can't send verification e-mails right now. Please try again in a little while.");
  });

  it("keeps the short wait for request-rate limits", () => {
    const error = toAuthAppError(new AuthApiError("slow down", 429, "over_request_rate_limit"));
    expect(error.status).toBe(429);
    expect(error.message).toMatch(/wait a minute/);
  });
});
