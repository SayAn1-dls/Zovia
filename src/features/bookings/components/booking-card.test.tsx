import { describe, expect, it } from "vitest";

import { earliestMoveIn } from "./booking-card";

describe("earliestMoveIn", () => {
  it("is today when the bed is free now", () => {
    expect(earliestMoveIn(null, "2026-11-19")).toBe("2026-11-19");
    expect(earliestMoveIn("2026-11-01", "2026-11-19")).toBe("2026-11-19");
  });

  it("is the bed's available-from date when that is later", () => {
    expect(earliestMoveIn("2026-12-05", "2026-11-19")).toBe("2026-12-05");
  });
});
