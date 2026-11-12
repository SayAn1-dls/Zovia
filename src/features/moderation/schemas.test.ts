import { describe, expect, it } from "vitest";

import { messageReportSchema, reportSchema } from "./schemas";

const id = "00000000-0000-4000-8000-000000000001";

describe("reportSchema", () => {
  it("accepts a person report and normalises empty details to null", () => {
    const parsed = reportSchema.parse({ target_type: "roommate_profile", target_id: id, reason_code: "fake_profile", details: "" });
    expect(parsed.details).toBeNull();
  });

  it("rejects listing-only reasons for messages", () => {
    expect(reportSchema.safeParse({ target_type: "message", target_id: id, reason_code: "fake_listing" }).success).toBe(false);
    expect(messageReportSchema.safeParse({ reason: "wrong_information" }).success).toBe(false);
    expect(messageReportSchema.safeParse({ reason: "harassment" }).success).toBe(true);
  });
});
