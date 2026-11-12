import { describe, expect, it } from "vitest";

import { onboardingSchema, profileSchema } from "./schemas";

const base = {
  intent: "find_home",
  display_name: "Asha",
  occupation: "other",
  preferred_city: "Sonipat",
  preferred_locality: "",
  college_name: "",
  course: "",
  academic_year: "",
  work_location: "",
  company: "",
  industry: "",
  work_schedule: "",
} as const;

describe("onboardingSchema", () => {
  it("turns empty optional answers into null", () => {
    const parsed = onboardingSchema.parse(base);
    expect(parsed.preferred_locality).toBeNull();
    expect(parsed.academic_year).toBeNull();
    expect(parsed.work_schedule).toBeNull();
  });

  it("requires a college for students and a work location for professionals", () => {
    const student = onboardingSchema.safeParse({ ...base, occupation: "student" });
    expect(student.error?.issues.map((issue) => issue.path[0])).toEqual(["college_name"]);
    const professional = onboardingSchema.safeParse({ ...base, occupation: "working_professional" });
    expect(professional.error?.issues.map((issue) => issue.path[0])).toEqual(["work_location"]);
  });

  it("coerces the academic year and bounds it", () => {
    expect(onboardingSchema.parse({ ...base, occupation: "student", college_name: "RU", academic_year: "2" }).academic_year).toBe(2);
    expect(onboardingSchema.safeParse({ ...base, academic_year: "9" }).success).toBe(false);
  });

  it("rejects an unknown intent", () => {
    expect(onboardingSchema.safeParse({ ...base, intent: "admin" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts an empty gender and caps the bio", () => {
    const values = { display_name: "Asha", gender: "", occupation: "", college_name: "", course: "", work_location: "", company: "", home_city: "", bio: "" };
    expect(profileSchema.parse(values).gender).toBeNull();
    expect(profileSchema.safeParse({ ...values, bio: "x".repeat(501) }).success).toBe(false);
  });
});
