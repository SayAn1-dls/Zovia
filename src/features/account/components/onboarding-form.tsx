"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Building2, House, KeyRound, Loader2, Users } from "lucide-react";
import { useState } from "react";
import { useController, useForm, useWatch } from "react-hook-form";

import { FieldError, FormField, FormMessage, applyApiFieldErrors } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refreshSession } from "@/features/auth/session-adapter";
import { cn } from "@/lib/utils";

import { completeOnboardingAction } from "../actions";
import {
  INTENT_LABELS,
  OCCUPATION_LABELS,
  OCCUPATIONS,
  USER_INTENTS,
  WORK_SCHEDULE_LABELS,
  WORK_SCHEDULES,
  onboardingSchema,
  type City,
  type OnboardingFormValues,
  type OnboardingInput,
  type OwnProfile,
} from "../schemas";
import { NativeSelect } from "./native-select";

const INTENT_ICONS = {
  find_home: House,
  find_roommate: Users,
  have_place_need_roommate: KeyRound,
  list_property: Building2,
} as const;

const FIELDS = [
  "intent",
  "display_name",
  "occupation",
  "preferred_city",
  "preferred_locality",
  "college_name",
  "course",
  "academic_year",
  "work_location",
  "company",
  "industry",
  "work_schedule",
] as const;

export function OnboardingForm({ profile, cities, next }: { profile: OwnProfile; cities: City[]; next?: string }) {
  const form = useForm<OnboardingFormValues, unknown, OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      intent: profile.intent ?? (undefined as unknown as OnboardingFormValues["intent"]),
      display_name: profile.display_name === "New member" ? "" : profile.display_name,
      occupation: profile.occupation ?? (undefined as unknown as OnboardingFormValues["occupation"]),
      preferred_city: profile.preferred_city ?? "",
      preferred_locality: profile.preferred_localities[0] ?? "",
      college_name: profile.college_name ?? "",
      course: profile.course ?? "",
      academic_year: profile.academic_year === null ? "" : String(profile.academic_year),
      work_location: profile.work_location ?? "",
      company: profile.company ?? "",
      industry: profile.industry ?? "",
      work_schedule: profile.work_schedule ?? "",
      next,
    },
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const occupation = useWatch({ control: form.control, name: "occupation" });
  const intent = useController({ control: form.control, name: "intent" });

  async function onSubmit() {
    setFailure(null);
    // The action parses the raw form values again with the same schema.
    const result = await completeOnboardingAction(form.getValues());
    if (!result.ok) {
      applyApiFieldErrors(form.setError, result.error.details, FIELDS);
      setFailure(result.error.message);
      return;
    }
    setRedirecting(true);
    await refreshSession();
    window.location.assign(result.data.redirect_to);
  }

  const busy = form.formState.isSubmitting || redirecting;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-10">
      {failure ? <FormMessage tone="danger" title="Not saved yet">{failure}</FormMessage> : null}

      <fieldset className="space-y-4">
        <legend className="text-lg font-bold text-foreground">What brings you to Zovia?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {USER_INTENTS.map((value) => {
            const Icon = INTENT_ICONS[value];
            const checked = intent.field.value === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/25",
                  checked ? "border-primary bg-primary/5" : "border-border hover:border-foreground/40",
                )}
              >
                <input
                  type="radio"
                  name={intent.field.name}
                  value={value}
                  checked={checked}
                  onChange={() => intent.field.onChange(value)}
                  onBlur={intent.field.onBlur}
                  className="sr-only"
                />
                <Icon className={cn("mt-0.5 size-5 shrink-0", checked ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span>
                  <span className="block font-semibold text-foreground">{INTENT_LABELS[value].title}</span>
                  <span className="block text-sm text-muted-foreground">{INTENT_LABELS[value].description}</span>
                </span>
              </label>
            );
          })}
        </div>
        {intent.fieldState.error?.message ? <FieldError>{intent.fieldState.error.message}</FieldError> : null}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-lg font-bold text-foreground">About you</legend>
        <FormField control={form.control} name="display_name" label="Your name" description="Shown on your profile and in chats.">
          {(field) => <Input autoComplete="name" {...field} />}
        </FormField>
        <FormField control={form.control} name="occupation" label="You are a">
          {(field) => (
            <NativeSelect {...field} value={field.value ?? ""}>
              <option value="" disabled>
                Choose one
              </option>
              {OCCUPATIONS.map((value) => (
                <option key={value} value={value}>
                  {OCCUPATION_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        {occupation === "student" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField control={form.control} name="college_name" label="College or university" className="sm:col-span-2">
              {(field) => <Input autoComplete="organization" {...field} value={field.value ?? ""} />}
            </FormField>
            <FormField control={form.control} name="course" label="Course" optional>
              {(field) => <Input {...field} value={field.value ?? ""} />}
            </FormField>
            <FormField control={form.control} name="academic_year" label="Year" optional>
              {(field) => (
                <NativeSelect {...field} value={String(field.value ?? "")}>
                  <option value="">Choose</option>
                  {[1, 2, 3, 4, 5, 6].map((year) => (
                    <option key={year} value={year}>
                      Year {year}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          </div>
        ) : null}

        {occupation === "working_professional" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField control={form.control} name="work_location" label="Where you work" description="Area or city, e.g. Whitefield." className="sm:col-span-2">
              {(field) => <Input {...field} value={field.value ?? ""} />}
            </FormField>
            <FormField control={form.control} name="company" label="Company" optional>
              {(field) => <Input autoComplete="organization" {...field} value={field.value ?? ""} />}
            </FormField>
            <FormField control={form.control} name="industry" label="Industry" optional>
              {(field) => <Input {...field} value={field.value ?? ""} />}
            </FormField>
            <FormField control={form.control} name="work_schedule" label="Work schedule" optional className="sm:col-span-2">
              {(field) => (
                <NativeSelect {...field} value={field.value ?? ""}>
                  <option value="">Choose</option>
                  {WORK_SCHEDULES.map((value) => (
                    <option key={value} value={value}>
                      {WORK_SCHEDULE_LABELS[value]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-lg font-bold text-foreground">Where are you looking?</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField control={form.control} name="preferred_city" label="City">
            {(field) => (
              <NativeSelect {...field}>
                <option value="" disabled>
                  Choose a city
                </option>
                {cities.map((city) => (
                  <option key={city.slug} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField control={form.control} name="preferred_locality" label="Area or locality" optional>
            {(field) => <Input placeholder="e.g. Koramangala" {...field} value={field.value ?? ""} />}
          </FormField>
        </div>
      </fieldset>

      <Button type="submit" size="xl" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Saving…" : "Continue"}
        {busy ? (
          <Loader2 data-icon="inline-end" className="animate-spin" aria-hidden />
        ) : (
          <ArrowRight data-icon="inline-end" aria-hidden />
        )}
      </Button>
    </form>
  );
}
