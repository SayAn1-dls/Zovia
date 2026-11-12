import { z } from "zod";

/** Moderation contracts (isomorphic). Codes match the CHECK constraints in the database. */

export const REPORT_TARGETS = ["user", "property", "roommate_profile", "review", "message"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "inappropriate",
  "scam",
  "contact_sharing",
  "fake_profile",
  "fake_listing",
  "wrong_information",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Reasons that make sense for a message (the database accepts exactly these for messages). */
export const MESSAGE_REPORT_REASONS = [
  "harassment",
  "spam",
  "scam",
  "inappropriate",
  "contact_sharing",
  "fake_profile",
  "other",
] as const satisfies readonly ReportReason[];

/** Reasons offered when reporting a person or roommate profile. */
export const PERSON_REPORT_REASONS = [
  "fake_profile",
  "harassment",
  "scam",
  "inappropriate",
  "spam",
  "other",
] as const satisfies readonly ReportReason[];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment or threats",
  inappropriate: "Inappropriate content",
  scam: "Scam or asking for money",
  contact_sharing: "Pushing to move off ZUVIO",
  fake_profile: "Fake profile",
  fake_listing: "Fake listing",
  wrong_information: "Wrong information",
  other: "Something else",
};

const details = z
  .string()
  .trim()
  .max(1000, "Keep it under 1,000 characters.")
  .optional()
  .transform((value) => (value ? value : null));

export const reportSchema = z
  .object({
    target_type: z.enum(REPORT_TARGETS),
    target_id: z.uuid("That item is not valid."),
    reason_code: z.enum(REPORT_REASONS, "Choose a reason."),
    details,
  })
  .refine(
    (value) => value.target_type !== "message" || (MESSAGE_REPORT_REASONS as readonly string[]).includes(value.reason_code),
    { path: ["reason_code"], message: "Choose a reason." },
  );
export type ReportInput = z.output<typeof reportSchema>;

export const messageReportSchema = z.object({
  reason: z.enum(MESSAGE_REPORT_REASONS, "Choose a reason."),
  details,
});
export type MessageReportInput = z.output<typeof messageReportSchema>;
