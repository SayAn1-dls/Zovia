import { z } from "zod";

import type { Database } from "@/lib/database.types";

/** Account contracts (isomorphic). Field names are the database columns (snake_case). */

type Enums = Database["public"]["Enums"];

export const USER_INTENTS = [
  "find_home",
  "find_roommate",
  "have_place_need_roommate",
  "list_property",
] as const satisfies readonly Enums["user_intent"][];

export const INTENT_LABELS: Record<Enums["user_intent"], { title: string; description: string }> = {
  find_home: { title: "Find a home", description: "PGs, hostels, co-living, rooms and flats." },
  find_roommate: { title: "Find a roommate", description: "Meet people who match your budget and lifestyle." },
  have_place_need_roommate: { title: "I have a place", description: "Find someone to share it with." },
  list_property: { title: "List a property", description: "Owners and PG operators publish vacancies." },
};

export const OCCUPATIONS = ["student", "working_professional", "other"] as const satisfies readonly Enums["occupation_type"][];
export const OCCUPATION_LABELS: Record<Enums["occupation_type"], string> = {
  student: "Student",
  working_professional: "Working professional",
  other: "Something else",
};

export const WORK_SCHEDULES = ["day", "night", "flexible", "remote", "irregular"] as const satisfies readonly Enums["work_schedule"][];
export const WORK_SCHEDULE_LABELS: Record<Enums["work_schedule"], string> = {
  day: "Day shift",
  night: "Night shift",
  flexible: "Flexible hours",
  remote: "Remote",
  irregular: "Irregular",
};

export const GENDERS = ["male", "female", "non_binary", "prefer_not_to_say"] as const satisfies readonly Enums["gender"][];
export const GENDER_LABELS: Record<Enums["gender"], string> = {
  male: "Male",
  female: "Female",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

/** "" from an untouched input becomes null, so optional text never stores an empty string. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value));

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your name.")
  .max(60, "Keep your name under 60 characters.");

export const onboardingSchema = z
  .object({
    intent: z.enum(USER_INTENTS, { error: "Choose what brings you here." }),
    display_name: displayNameSchema,
    occupation: z.enum(OCCUPATIONS, { error: "Choose one." }),
    preferred_city: z.string().trim().min(2, "Choose a city.").max(80),
    preferred_locality: optionalText(80, "Keep it under 80 characters."),
    college_name: optionalText(120, "Keep it under 120 characters."),
    course: optionalText(120, "Keep it under 120 characters."),
    academic_year: z.union([z.literal(""), z.coerce.number().int().min(1).max(8)]).transform((value) => (value === "" ? null : value)),
    work_location: optionalText(120, "Keep it under 120 characters."),
    company: optionalText(120, "Keep it under 120 characters."),
    industry: optionalText(80, "Keep it under 80 characters."),
    work_schedule: z.union([z.literal(""), z.enum(WORK_SCHEDULES)]).transform((value) => (value === "" ? null : value)),
    next: z.string().max(2048).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.occupation === "student" && !value.college_name) {
      ctx.addIssue({ code: "custom", path: ["college_name"], message: "Enter your college or university." });
    }
    if (value.occupation === "working_professional" && !value.work_location) {
      ctx.addIssue({ code: "custom", path: ["work_location"], message: "Enter where you work (area or city)." });
    }
  });
export type OnboardingFormValues = z.input<typeof onboardingSchema>;
export type OnboardingInput = z.output<typeof onboardingSchema>;

export const profileSchema = z.object({
  display_name: displayNameSchema,
  gender: z.union([z.literal(""), z.enum(GENDERS)]).transform((value) => (value === "" ? null : value)),
  occupation: z.union([z.literal(""), z.enum(OCCUPATIONS)]).transform((value) => (value === "" ? null : value)),
  college_name: optionalText(120, "Keep it under 120 characters."),
  course: optionalText(120, "Keep it under 120 characters."),
  work_location: optionalText(120, "Keep it under 120 characters."),
  company: optionalText(120, "Keep it under 120 characters."),
  home_city: optionalText(80, "Keep it under 80 characters."),
  bio: optionalText(500, "Keep your bio under 500 characters."),
});
export type ProfileFormValues = z.input<typeof profileSchema>;
export type ProfileInput = z.output<typeof profileSchema>;

/** GET /api/v1/me: what the browser may know about the signed-in account. */
export type Me = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  roles: Enums["user_role"][];
  status: Enums["account_status"];
  onboarded: boolean;
};

export type City = { slug: string; name: string };

export type OwnProfile = {
  email: string | null;
  intent: Enums["user_intent"] | null;
  display_name: string;
  gender: Enums["gender"] | null;
  occupation: Enums["occupation_type"] | null;
  college_name: string | null;
  course: string | null;
  academic_year: number | null;
  work_location: string | null;
  company: string | null;
  industry: string | null;
  work_schedule: Enums["work_schedule"] | null;
  home_city: string | null;
  bio: string | null;
  preferred_city: string | null;
  preferred_localities: string[];
};
