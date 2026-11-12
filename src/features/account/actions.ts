"use server";

import { createAction } from "@/server/http/action";

import { onboardingSchema, profileSchema, type OnboardingFormValues, type ProfileFormValues } from "./schemas";
import { completeOnboarding, updateOwnProfile } from "./service";

const runCompleteOnboarding = createAction(
  { auth: "user", label: "account.complete_onboarding", input: onboardingSchema },
  (ctx, input) => completeOnboarding(ctx, input),
);
export async function completeOnboardingAction(input: OnboardingFormValues) {
  return runCompleteOnboarding(input);
}

const runUpdateProfile = createAction(
  { auth: "user", label: "account.update_profile", input: profileSchema },
  (ctx, input) => updateOwnProfile(ctx, input),
);
export async function updateProfileAction(input: ProfileFormValues) {
  return runUpdateProfile(input);
}
