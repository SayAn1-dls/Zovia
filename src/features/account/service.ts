import "server-only";

import type { Route } from "next";

import { safeNextPath } from "@/lib/api/safe-next-path";
import { routes } from "@/lib/navigation";
import type { ServiceContext, UserServiceContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { errors } from "@/server/http/errors";

import * as repo from "./repository";
import type { City, Me, OnboardingInput, OwnProfile, ProfileInput } from "./schemas";

/** Public URL of an object in the public `avatars` bucket (spec 6.8). */
function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  const base = env().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/avatars/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function getMe(ctx: UserServiceContext): Promise<Me> {
  const card = await repo.fetchDisplayCard(ctx.supabase, ctx.user.id);
  return {
    id: ctx.user.id,
    display_name: card?.display_name ?? "New member",
    avatar_url: avatarUrl(card?.avatar_path ?? null),
    roles: ctx.user.roles,
    status: ctx.user.status,
    onboarded: ctx.user.onboarding_completed_at !== null,
  };
}

export async function getOwnProfile(ctx: UserServiceContext): Promise<OwnProfile> {
  const profile = await repo.fetchOwnProfile(ctx.supabase, ctx.user.id);
  if (!profile) throw errors.notFound("We could not load your account.");
  return profile;
}

export async function listCities(ctx: ServiceContext): Promise<City[]> {
  return repo.listActiveCities(ctx.supabase);
}

/** Where each intent continues after onboarding (spec section 5). */
const INTENT_DESTINATION: Record<OnboardingInput["intent"], Route> = {
  find_home: routes.search,
  find_roommate: routes.roommateProfile,
  have_place_need_roommate: routes.roommateProfile,
  list_property: routes.ownerOnboarding,
};

/**
 * Saves the onboarding answers. `onboarding_completed_at` is written last, so if an earlier
 * write fails the person is still "not onboarded" and can simply submit again (every write is
 * an idempotent update of their own rows).
 */
export async function completeOnboarding(ctx: UserServiceContext, input: OnboardingInput): Promise<{ redirect_to: string }> {
  const isStudent = input.occupation === "student";
  const isProfessional = input.occupation === "working_professional";

  await repo.updateProfile(ctx.supabase, ctx.user.id, {
    display_name: input.display_name,
    occupation: input.occupation,
    college_name: isStudent ? input.college_name : null,
    course: isStudent ? input.course : null,
    academic_year: isStudent ? input.academic_year : null,
    work_location: isProfessional ? input.work_location : null,
    company: isProfessional ? input.company : null,
    industry: isProfessional ? input.industry : null,
    work_schedule: isProfessional ? input.work_schedule : null,
  });
  await repo.updatePreferences(ctx.supabase, ctx.user.id, {
    preferred_city: input.preferred_city,
    preferred_localities: input.preferred_locality ? [input.preferred_locality] : [],
  });
  await repo.updateUser(ctx.supabase, ctx.user.id, {
    intent: input.intent,
    onboarding_completed_at: new Date().toISOString(),
  });

  return { redirect_to: safeNextPath(input.next, "") || INTENT_DESTINATION[input.intent] };
}

export async function updateOwnProfile(ctx: UserServiceContext, input: ProfileInput): Promise<void> {
  await repo.updateProfile(ctx.supabase, ctx.user.id, input);
}
