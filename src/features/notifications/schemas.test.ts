import { describe, expect, it } from "vitest";

import { safeLinkPath } from "./schemas";

describe("safeLinkPath", () => {
  it("only lets same-origin relative paths through", () => {
    expect(safeLinkPath("/messages/abc")).toBe("/messages/abc");
    expect(safeLinkPath("//evil.example")).toBeNull();
    expect(safeLinkPath("https://evil.example")).toBeNull();
    expect(safeLinkPath(null)).toBeNull();
  });
});
