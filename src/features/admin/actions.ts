"use server";

import { createAction } from "@/server/http/action";

import { contactUpdateSchema, reviewDecisionSchema, type ContactUpdateValues, type ReviewDecisionValues } from "./schemas";
import { reviewListing, updateContactMessage } from "./service";

/** Staff-only actions. admin_review_property() re-checks is_staff() and writes the audit log. */
const runReview = createAction(
  { auth: "staff", label: "admin.review_property", input: reviewDecisionSchema },
  (ctx, input) => reviewListing(ctx, input),
);
export async function reviewListingAction(input: ReviewDecisionValues) {
  return runReview(input);
}

const runContactUpdate = createAction(
  { auth: "staff", label: "admin.update_contact_message", input: contactUpdateSchema },
  (ctx, input) => updateContactMessage(ctx, input),
);
export async function updateContactMessageAction(input: ContactUpdateValues) {
  return runContactUpdate(input);
}
