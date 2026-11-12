import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/saved", "/saved"],
    ["/messages/123?tab=all#latest", "/messages/123?tab=all#latest"],
    ["/search?city=pune&budget_max=15000", "/search?city=pune&budget_max=15000"],
    ["/owner/properties/new", "/owner/properties/new"],
    ["/search?q=a%20b", "/search?q=a%20b"],
    ["/properties/sunny-pg?ref=https%3A%2F%2Fexample.com", "/properties/sunny-pg?ref=https%3A%2F%2Fexample.com"],
  ])("accepts %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/saved"],
    ["backslash after slash", "/\\evil.com"],
    ["double backslash", "\\\\evil.com"],
    ["backslash then slash", "\\/evil.com"],
    ["backslash later in path", "/a\\..\\//evil.com"],
    ["absolute https", "https://evil.com"],
    ["absolute http", "http://evil.com/saved"],
    ["scheme without slashes", "https:evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["encoded //", "/%2F%2Fevil.com"],
    ["encoded // lower-case", "/%2f%2fevil.com"],
    ["encoded slash after slash", "/%2Fevil.com"],
    ["encoded backslash", "/%5Cevil.com"],
    ["encoded backslash lower-case", "/%5cevil.com"],
    ["double-encoded //", "/%252F%252Fevil.com"],
    ["double-encoded backslash", "/%255Cevil.com"],
    ["tab stripped by URL parsers", "/\t/evil.com"],
    ["newline stripped by URL parsers", "/\n/evil.com"],
    ["encoded tab", "/%09/evil.com"],
    ["encoded newline", "/%0A/evil.com"],
    ["leading space", " /saved"],
    ["leading space then //", " //evil.com"],
    ["null byte", "/saved\u0000"],
    ["relative without slash", "saved"],
    ["dot-relative", "./saved"],
    ["userinfo trick", "/@evil.com/../..//evil.com"],
    ["malformed escape", "/%E0%A4%A"],
    ["empty", ""],
  ])("rejects %s", (_name, input) => {
    expect(safeNextPath(input)).toBe("/");
    expect(safeNextPath(input, "/search")).toBe("/search");
  });

  it("rejects non-strings and over-long values", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(["/saved"])).toBe("/");
    expect(safeNextPath({ toString: () => "/saved" })).toBe("/");
    expect(safeNextPath(`/${"a".repeat(3000)}`)).toBe("/");
  });

  it("never returns something a browser would resolve off-origin", () => {
    const inputs = ["//evil.com", "/\\evil.com", "/%2F%2Fevil.com", "https://evil.com", "/ok", "/a/../b", "/..//evil.com"];
    for (const input of inputs) {
      const out = safeNextPath(input);
      expect(new URL(out, "https://zuvio.example").origin).toBe("https://zuvio.example");
      expect(out.startsWith("//")).toBe(false);
    }
  });
});
