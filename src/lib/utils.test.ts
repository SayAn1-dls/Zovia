import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class names and drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b", { c: true, d: false })).toBe(
      "a b c",
    );
  });

  it("lets later Tailwind utilities override conflicting earlier ones", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("text-sm text-red-500", "text-lg")).toBe("text-red-500 text-lg");
  });

  it("returns an empty string when nothing is passed", () => {
    expect(cn()).toBe("");
  });
});
